const { test } = require("node:test");
const assert = require("node:assert/strict");
const { simularDb, buscarConsulta } = require("../helpers/entorno");
const {
  TIPO_EVENTO,
  idMensaje,
  armarMensaje,
  registrarStockActualizado,
  procesarSiguienteEvento,
} = require("../../src/services/stockVentasOutbox");

test("el mensaje de Ventas lleva el stock disponible y un id por movimiento", () => {
  const clave = idMensaje({
    tipoMovimiento: "SALIDA",
    idMovimiento: 15,
    idProducto: 4,
    idAlmacen: 2,
  });
  assert.equal(clave, "inventario.stock-actualizado:SALIDA:15:4:2");
  assert.equal(
    idMensaje({ tipoMovimiento: "SALIDA", idMovimiento: 15, idProducto: 4, idAlmacen: 2 }),
    clave,
  );

  const mensaje = armarMensaje({
    id_mensaje: clave,
    sucursal: "SUC-NORTE",
    codigo_producto: "PROD-001",
    stock_disponible: "8.0000",
    fecha: "2026-11-23T05:00:00Z",
  });
  assert.deepEqual(mensaje, {
    id_mensaje: clave,
    tipo_evento: TIPO_EVENTO,
    sucursal: "SUC-NORTE",
    codigo_producto: "PROD-001",
    stock_disponible: 8,
    fecha: "2026-11-23T05:00:00Z",
  });
  assert.equal(Object.keys(mensaje).length, 6);
});

test("el evento se guarda en la misma transacción y no inserta otro si ya existe", async () => {
  const client = simularDb([{ rows: [], rowCount: 1 }]);

  await registrarStockActualizado(client, {
    tipoMovimiento: "ENTRADA",
    idMovimiento: 9,
    idProducto: 3,
    idAlmacen: 1,
  });

  const insert = buscarConsulta(client, "INSERT INTO outbox_evento");
  assert.ok(insert.sql.includes("ON CONFLICT (id_mensaje)"));
  assert.ok(insert.sql.includes("estado <> 'enviado'"));
  assert.equal(insert.params[0], "inventario.stock-actualizado:ENTRADA:9:3:1");
  assert.equal(insert.params[1], TIPO_EVENTO);
  assert.equal(client.liberado, false);
});

test("si Pub/Sub responde, el evento queda enviado una sola vez", async () => {
  const evento = {
    id_outbox: 7,
    id_mensaje: "inventario.stock-actualizado:AJUSTE:2:3:1",
    sucursal: "ALM-CENT",
    codigo_producto: "PROD-002",
    stock_disponible: "5",
    fecha: "2026-11-23T05:10:00Z",
  };
  const db = simularDb([
    { rows: [] },
    { rows: [evento] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);
  const enviados = [];

  const hubo = await procesarSiguienteEvento(async (fila) => {
    enviados.push(armarMensaje(fila));
    return "msg-1";
  });
  const otra = await procesarSiguienteEvento(async () => "msg-2");

  assert.equal(hubo, true);
  assert.equal(otra, false);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].tipo_evento, TIPO_EVENTO);
  assert.equal(enviados[0].stock_disponible, 5);
  const marca = buscarConsulta(db, "estado = 'enviado'");
  assert.deepEqual(marca.params, [7, "msg-1"]);
});

test("si Pub/Sub falla, el evento queda en error para reintentarlo", async () => {
  const db = simularDb([
    { rows: [] },
    {
      rows: [{
        id_outbox: 4,
        id_mensaje: "inventario.stock-actualizado:SALIDA:1:1:1",
        sucursal: "SUC-NORTE",
        codigo_producto: "PROD-001",
        stock_disponible: "0",
        fecha: "2026-11-23T05:12:00Z",
      }],
    },
    { rows: [] },
    { rows: [] },
  ]);

  const hubo = await procesarSiguienteEvento(async () => {
    throw new Error("pubsub caído");
  });

  assert.equal(hubo, true);
  const fallo = buscarConsulta(db, "SET estado = 'error'");
  assert.equal(fallo.params[0], 4);
  assert.equal(fallo.params[1], "pubsub caído");
  assert.ok(buscarConsulta(db, "estado = 'pendiente'"));
});
