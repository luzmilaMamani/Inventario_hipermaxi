require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clienteSql } = require("../helpers/clienteSql");
const ventas = require("../../src/services/ventasRecibidas");

const VENTA = {
  id_venta: "V-1",
  sucursal: "SUC-001",
  fecha: "2026-11-18T10:00:00.000Z",
  detalle: [
    { codigo_producto: "PRD-001", cantidad: 3 },
    { codigo_producto: "PRD-001", cantidad: 2 }, // se suma con la línea anterior
  ],
};

// Escenario base: la venta se guarda nueva, la sucursal existe, el producto 1
// tiene un lote con 10 unidades y stock 10 sin reservas.
function escenario({ ventaGuardada = { id_venta_recibida: 7, id_venta: "V-1", sucursal: "SUC-001", estado: "PENDIENTE" }, lineas, stock = "10", lotes, almacen = 2 } = {}) {
  return clienteSql([
    ["INSERT INTO venta_recibida (", { rows: [ventaGuardada] }],
    ["FROM almacenes", { rows: almacen ? [{ id_almacen: almacen }] : [] }],
    ["FROM venta_recibida_detalle d", { rows: lineas ?? [{ id_venta_recibida_detalle: 1, codigo_producto: "PRD-001", cantidad: "5", id_producto: 1, precio: "10" }] }],
    ["FROM lotes_productos lp", { rows: lotes ?? [{ id_lote: 50, numero_lote: "L1", cantidad_actual: "10" }] }],
    [/FROM stock\s+WHERE/, { rows: [{ id_stock: 9, cantidad: stock, reservada: "0" }] }],
    ["fn_cantidad_no_disponible", { rows: [{ cantidad: "0" }] }],
  ]);
}

test("referenciaVenta arma la referencia de los movimientos", () => {
  assert.equal(ventas.referenciaVenta("V-9"), "VENTA-V-9");
});

test("venta confirmada: suma líneas repetidas, descuenta por FEFO y queda DESCONTADA", async () => {
  const c = escenario();
  const r = await ventas.registrarVentaConfirmada(c, VENTA, "m-1");
  assert.equal(r.estado, "DESCONTADA");

  const detalle = c.buscar("INSERT INTO venta_recibida_detalle");
  assert.equal(detalle.length, 1);
  assert.deepEqual(detalle[0].params, [7, "PRD-001", 5]);

  const movimiento = c.buscar("INSERT INTO movimientos_inventario")[0];
  assert.match(movimiento.sql, /'VENTA'/);
  assert.deepEqual(movimiento.params.slice(0, 7), [1, 2, 50, 5, 10, 5, "VENTA-V-1"]);
  assert.deepEqual(c.buscar("UPDATE stock SET cantidad")[0].params, [5, 9]);
  assert.ok(c.buscar("SET estado = 'DESCONTADA'").length);
  assert.ok(c.buscar("RELEASE SAVEPOINT").length);
});

test("venta ya descontada o ya anulada no se vuelve a aplicar", async () => {
  for (const estado of ["DESCONTADA", "ANULADA"]) {
    const c = escenario({ ventaGuardada: { id_venta_recibida: 7, id_venta: "V-1", estado } });
    const r = await ventas.registrarVentaConfirmada(c, VENTA, "m-2");
    assert.equal(r.estado, estado);
    assert.equal(r.sin_cambios, true);
    assert.equal(c.buscar("INSERT INTO movimientos_inventario").length, 0);
  }
});

test("producto inexistente: vuelve al savepoint y la venta queda en ERROR", async () => {
  const c = escenario({ lineas: [{ id_venta_recibida_detalle: 1, codigo_producto: "NO-EXISTE", cantidad: "1", id_producto: null }] });
  const r = await ventas.registrarVentaConfirmada(c, VENTA, "m-3");
  assert.equal(r.estado, "ERROR");
  assert.match(r.error, /NO-EXISTE/);
  assert.ok(c.buscar("ROLLBACK TO SAVEPOINT").length);
  assert.deepEqual(c.buscar("SET estado = 'ERROR'")[0].params[1], 7);
});

test("sin stock disponible: ERROR con el detalle de lo pedido y lo disponible", async () => {
  const c = escenario({ stock: "2", lotes: [{ id_lote: 50, numero_lote: "L1", cantidad_actual: "10" }] });
  const r = await ventas.registrarVentaConfirmada(c, VENTA, "m-4");
  assert.equal(r.estado, "ERROR");
  assert.match(r.error, /pedido 5, disponible 2/);
  assert.equal(c.buscar("INSERT INTO movimientos_inventario").length, 0);
});

test("lotes vigentes insuficientes también deja la venta en ERROR", async () => {
  const c = escenario({ lotes: [{ id_lote: 50, numero_lote: "L1", cantidad_actual: "1" }] });
  const r = await ventas.registrarVentaConfirmada(c, VENTA, "m-5");
  assert.equal(r.estado, "ERROR");
  assert.match(r.error, /lotes vigentes/);
});

test("sucursal desconocida: ERROR sin tocar el stock", async () => {
  const c = escenario({ almacen: null });
  const r = await ventas.registrarVentaConfirmada(c, { ...VENTA, sucursal: "SUC-999" }, "m-6");
  assert.equal(r.estado, "ERROR");
  assert.match(r.error, /no existe o está inactiva/);
});

test("un error que no es de negocio se propaga para que el mensaje se reintente", async () => {
  const c = escenario();
  c.query = async (sql) => {
    if (String(sql).includes("INSERT INTO venta_recibida (")) throw new Error("conexión perdida");
    return { rows: [], rowCount: 0 };
  };
  await assert.rejects(ventas.registrarVentaConfirmada(c, VENTA, "m-7"), /conexión perdida/);
});

test("anulación de una venta descontada devuelve las unidades a los mismos lotes", async () => {
  const c = clienteSql([
    [/FROM venta_recibida WHERE id_venta = \$1 FOR UPDATE/, { rows: [{ id_venta_recibida: 7, id_venta: "V-1", estado: "DESCONTADA" }] }],
    ["m.tipo_movimiento = 'VENTA'", { rows: [{ id_producto: 1, id_almacen: 2, id_lote: 50, cantidad: "5" }] }],
    ["SELECT id_stock, cantidad FROM stock", { rows: [{ id_stock: 9, cantidad: "5" }] }],
    ["UPDATE venta_recibida", { rows: [{ id_venta: "V-1", estado: "ANULADA" }] }],
  ]);
  const r = await ventas.registrarVentaAnulada(c, { id_venta: "V-1", sucursal: "SUC-001", fecha: VENTA.fecha }, "m-8");
  assert.equal(r.estado, "ANULADA");
  assert.equal(r.unidades_reingresadas, 5);
  const reingreso = c.buscar("INSERT INTO movimientos_inventario")[0];
  assert.match(reingreso.sql, /'ANULACION_VENTA'/);
  assert.deepEqual(reingreso.params.slice(0, 6), [1, 2, 50, 5, 5, 10]);
  assert.ok(c.buscar("cantidad_actual = cantidad_actual + $1").length, "suma al lote original");
});

test("anulación antes que la confirmación registra la venta como ANULADA", async () => {
  const c = clienteSql([[/FROM venta_recibida WHERE id_venta/, { rows: [] }]]);
  const r = await ventas.registrarVentaAnulada(c, { id_venta: "V-2", sucursal: "SUC-001", fecha: VENTA.fecha }, "m-9");
  assert.equal(r.sin_venta_previa, true);
  assert.match(c.buscar("INSERT INTO venta_recibida")[0].sql, /'ANULADA'/);
});

test("anulación repetida o de una venta con error no mueve stock", async () => {
  const repetida = clienteSql([[/FROM venta_recibida WHERE/, { rows: [{ id_venta_recibida: 7, id_venta: "V-1", estado: "ANULADA" }] }]]);
  assert.equal((await ventas.registrarVentaAnulada(repetida, { id_venta: "V-1" }, "m-10")).sin_cambios, true);

  const conError = clienteSql([
    [/FROM venta_recibida WHERE/, { rows: [{ id_venta_recibida: 8, id_venta: "V-3", estado: "ERROR" }] }],
    ["UPDATE venta_recibida", { rows: [{ id_venta: "V-3", estado: "ANULADA" }] }],
  ]);
  const r = await ventas.registrarVentaAnulada(conError, { id_venta: "V-3" }, "m-11");
  assert.equal(r.unidades_reingresadas, 0);
  assert.equal(conError.buscar("INSERT INTO movimientos_inventario").length, 0);
});

test("reprocesarVenta reintenta solo ventas en ERROR o PENDIENTE", async () => {
  const noExiste = clienteSql([[/FROM venta_recibida WHERE/, { rows: [] }]]);
  await assert.rejects(ventas.reprocesarVenta(noExiste, "V-X"), (e) => e instanceof ventas.ErrorVenta);

  const descontada = clienteSql([[/FROM venta_recibida WHERE/, { rows: [{ id_venta: "V-1", estado: "DESCONTADA" }] }]]);
  assert.equal((await ventas.reprocesarVenta(descontada, "V-1")).sin_cambios, true);

  const conError = escenario();
  conError.query = ((original) => async (sql, params) =>
    String(sql).includes("FROM venta_recibida WHERE id_venta")
      ? { rows: [{ id_venta_recibida: 7, id_venta: "V-1", sucursal: "SUC-001", estado: "ERROR" }], rowCount: 1 }
      : original(sql, params))(conError.query);
  assert.equal((await ventas.reprocesarVenta(conError, "V-1")).estado, "DESCONTADA");
});
