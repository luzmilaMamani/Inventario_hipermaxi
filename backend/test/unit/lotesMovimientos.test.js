require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clienteSql } = require("../helpers/clienteSql");
const movimientos = require("../../src/services/lotesMovimientos");

const VIGENTES = { rows: [
  { id_lote: 1, numero_lote: "L-1", cantidad_actual: "4" },
  { id_lote: 2, numero_lote: "L-2", cantidad_actual: "10" },
] };

test("bloquearLotes y sumarALote envían el bloqueo y la suma al lote", async () => {
  const c = clienteSql();
  await movimientos.bloquearLotes(c, 3, 4);
  await movimientos.sumarALote(c, 9, 5);
  assert.match(c.consultas[0].sql, /FOR UPDATE/);
  assert.deepEqual(c.consultas[0].params, [3, 4]);
  assert.deepEqual(c.consultas[1].params, [5, 9, false]);
});

test("transferencia: el envío descuenta los lotes del origen por FEFO y registra cada lote", async () => {
  const c = clienteSql([["FROM lotes_productos lp", VIGENTES]]);
  await movimientos.enviarLotesTransferencia(c, { idDetalle: 70, idProducto: 3, idAlmacen: 1, cantidad: 6 });
  const descuentos = c.buscar("cantidad_actual = cantidad_actual - $1");
  assert.deepEqual(descuentos.map((d) => d.params), [[4, 1], [2, 2]]);
  assert.deepEqual(c.buscar("INSERT INTO detalle_transferencia_lotes").map((q) => q.params), [[70, 1, 4], [70, 2, 2]]);
});

test("transferencia: el envío falla si el origen no tiene lotes suficientes", async () => {
  const c = clienteSql([["FROM lotes_productos lp", VIGENTES]]);
  await assert.rejects(
    movimientos.enviarLotesTransferencia(c, { idDetalle: 70, idProducto: 3, idAlmacen: 1, cantidad: 20 }),
    { statusCode: 400 },
  );
});

const ENVIOS = { rows: [
  { id_detalle_transferencia_lote: 1, cantidad_enviada: "4", id_producto: 3, numero_lote: "L-1", fecha_ingreso: "2026-10-01", fecha_vencimiento: "2027-01-01", controla_vencimiento: true },
  { id_detalle_transferencia_lote: 2, cantidad_enviada: "2", id_producto: 3, numero_lote: "L-2", fecha_ingreso: "2026-10-05", fecha_vencimiento: "2027-02-01", controla_vencimiento: true },
] };

test("transferencia: la recepción completa recrea cada lote en destino con su vencimiento", async () => {
  const c = clienteSql([
    ["FROM detalle_transferencia_lotes dtl", ENVIOS],
    ["AND numero_lote = $3", { rows: [] }],
    ["INSERT INTO lotes_productos", { rows: [{ id_lote: 99 }] }],
  ]);
  await movimientos.recibirLotesTransferencia(c, {
    idDetalle: 70, idProducto: 3, idAlmacenDestino: 2, numeroTransferencia: "TRF-1", cantidadRecibida: 6,
  });
  const ingresos = c.buscar("INSERT INTO lotes_productos").map((q) => q.params);
  assert.deepEqual(ingresos.map((p) => [p[2], p[4], p[5]]), [["L-1", "2027-01-01", 4], ["L-2", "2027-02-01", 2]]);
  assert.deepEqual(c.buscar("UPDATE detalle_transferencia_lotes").map((q) => q.params[0]), [4, 2]);
});

test("transferencia: un faltante recae en el último lote y un lote homónimo con otra fecha no se mezcla", async () => {
  const c = clienteSql([
    ["FROM detalle_transferencia_lotes dtl", ENVIOS],
    // En destino ya hay un L-1 con otra fecha de vencimiento.
    ["AND numero_lote = $3", (_sql, params) => (params[2] === "L-1" ? { rows: [{ id_lote: 5, fecha_vencimiento: "2026-12-01" }] } : { rows: [] })],
    ["INSERT INTO lotes_productos", { rows: [{ id_lote: 99 }] }],
  ]);
  await movimientos.recibirLotesTransferencia(c, {
    idDetalle: 70, idProducto: 3, idAlmacenDestino: 2, numeroTransferencia: "TRF-7", cantidadRecibida: 5,
  });
  const ingresos = c.buscar("INSERT INTO lotes_productos").map((q) => [q.params[2], q.params[5]]);
  assert.deepEqual(ingresos, [["L-1-TRF-7", 4], ["L-2", 1]]);
});

test("transferencia: una recepción sin lotes registrados ingresa un lote SALDO", async () => {
  const c = clienteSql([
    ["FROM detalle_transferencia_lotes dtl", { rows: [] }],
    ["INSERT INTO lotes_productos", { rows: [{ id_lote: 99 }] }],
  ]);
  await movimientos.recibirLotesTransferencia(c, {
    idDetalle: 70, idProducto: 3, idAlmacenDestino: 2, numeroTransferencia: "TRF-1", cantidadRecibida: 3,
  });
  assert.equal(c.buscar("INSERT INTO lotes_productos")[0].params[2], "SALDO-3-2");

  const nada = clienteSql([["FROM detalle_transferencia_lotes dtl", { rows: [] }]]);
  await movimientos.recibirLotesTransferencia(nada, { idDetalle: 70, idProducto: 3, idAlmacenDestino: 2, cantidadRecibida: 0 });
  assert.equal(nada.buscar("INSERT INTO lotes_productos").length, 0);
});

test("transferencia: un lote sin fecha de un producto que controla vencimiento llega como SALDO", async () => {
  const c = clienteSql([
    ["FROM detalle_transferencia_lotes dtl", { rows: [{ ...ENVIOS.rows[0], fecha_vencimiento: null }] }],
    ["INSERT INTO lotes_productos", { rows: [{ id_lote: 99 }] }],
  ]);
  await movimientos.recibirLotesTransferencia(c, { idDetalle: 1, idProducto: 3, idAlmacenDestino: 2, numeroTransferencia: "T", cantidadRecibida: 4 });
  assert.equal(c.buscar("INSERT INTO lotes_productos")[0].params[2], "SALDO-L-1");
});

test("ajuste: exige fecha de vencimiento si suma a un producto sin lotes vigentes", async () => {
  const sinLotes = clienteSql([["FROM lotes_productos lp", { rows: [] }]]);
  await assert.rejects(
    movimientos.validarAjusteEnLotes(sinLotes, { idProducto: 3, idAlmacen: 1, diferencia: 5, controlaVencimiento: true }),
    { statusCode: 400, message: /fecha de vencimiento/ },
  );
  // Con fecha, con lotes, restando o sin control de vencimiento no hay nada que validar.
  await movimientos.validarAjusteEnLotes(sinLotes, { idProducto: 3, idAlmacen: 1, diferencia: 5, controlaVencimiento: true, fechaVencimiento: "2027-01-01" });
  await movimientos.validarAjusteEnLotes(sinLotes, { idProducto: 3, idAlmacen: 1, diferencia: -5, controlaVencimiento: true });
  await movimientos.validarAjusteEnLotes(clienteSql([["FROM lotes_productos lp", VIGENTES]]), { idProducto: 3, idAlmacen: 1, diferencia: 5, controlaVencimiento: true });
});

test("ajuste positivo: suma al lote vigente que vence más tarde, o crea un lote con el número del ajuste", async () => {
  const conLotes = clienteSql([["FROM lotes_productos lp", VIGENTES]]);
  await movimientos.aplicarAjusteEnLotes(conLotes, { idProducto: 3, idAlmacen: 1, diferencia: 7, numeroAjuste: "AJU-1" });
  assert.deepEqual(conLotes.buscar("cantidad_actual = cantidad_actual + $1")[0].params.slice(0, 2), [7, 2]);

  const sinLotes = clienteSql([
    ["FROM lotes_productos lp", { rows: [] }],
    ["INSERT INTO lotes_productos", { rows: [{ id_lote: 30 }] }],
  ]);
  await movimientos.aplicarAjusteEnLotes(sinLotes, { idProducto: 3, idAlmacen: 1, diferencia: 7, numeroAjuste: "AJU-1", fechaVencimiento: "2027-05-01" });
  assert.deepEqual(sinLotes.buscar("INSERT INTO lotes_productos")[0].params.slice(2, 6), ["AJU-1", null, "2027-05-01", 7]);
});

test("ajuste negativo: descuenta de los lotes empezando por los que no están en cuarentena y vencen antes", async () => {
  const c = clienteSql([["cantidad_actual > 0", { rows: [{ id_lote: 1, cantidad_actual: "3" }, { id_lote: 2, cantidad_actual: "10" }] }]]);
  await movimientos.aplicarAjusteEnLotes(c, { idProducto: 3, idAlmacen: 1, diferencia: -5 });
  assert.match(c.consultas[0].sql, /ORDER BY \(estado = 'CUARENTENA'\) ASC/);
  assert.deepEqual(c.buscar("cantidad_actual - $1").map((q) => q.params), [[3, 1], [2, 2]]);

  const cero = clienteSql();
  await movimientos.aplicarAjusteEnLotes(cero, { idProducto: 3, idAlmacen: 1, diferencia: 0 });
  assert.equal(cero.consultas.length, 0);
});
