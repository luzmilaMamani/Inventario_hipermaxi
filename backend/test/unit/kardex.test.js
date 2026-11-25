const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularKardex, filtrarPeriodo } = require("../../src/services/kardex");

test("el promedio ponderado cambia con una entrada y la salida no lo mueve", () => {
  const kardex = calcularKardex(
    [
      { id_movimiento: 1, fecha: "2026-01-01", tipo_movimiento: "ENTRADA", cantidad_neta: 10, costo_unitario: 5 },
      { id_movimiento: 2, fecha: "2026-01-02", tipo_movimiento: "SALIDA", cantidad_neta: -4, costo_unitario: 99 },
      { id_movimiento: 3, fecha: "2026-01-03", tipo_movimiento: "ENTRADA", cantidad_neta: 10, costo_unitario: 8 },
    ],
    { stockActual: 16, precioInicial: 0 },
  );

  assert.equal(kardex.saldo_final, 16);
  assert.equal(kardex.costo_promedio, 6.875);
  assert.equal(kardex.saldo_valorizado, 110);
  assert.equal(kardex.filas[1].costo_unitario, 5);
  assert.equal(kardex.filas[1].saldo, 6);
  assert.equal(kardex.filas[2].entrada, 10);
  assert.equal(kardex.filas[2].salida, 0);
});

test("el saldo final coincide con el stock aunque haya existencias previas a los movimientos", () => {
  const kardex = calcularKardex(
    [{ id_movimiento: 1, fecha: "2026-02-01", tipo_movimiento: "SALIDA", cantidad_neta: -2, costo_unitario: 4 }],
    { stockActual: 8, precioInicial: 4 },
  );

  assert.equal(kardex.filas[0].tipo_movimiento, "SALDO_INICIAL");
  assert.equal(kardex.filas[0].saldo, 10);
  assert.equal(kardex.saldo_final, 8);
  assert.equal(kardex.saldo_valorizado, 32);
});

test("el período conserva el saldo anterior y no recalcula el cierre", () => {
  const kardex = calcularKardex(
    [
      { id_movimiento: 1, fecha: "2026-01-01", tipo_movimiento: "ENTRADA", cantidad_neta: 10, costo_unitario: 2 },
      { id_movimiento: 2, fecha: "2026-02-01", tipo_movimiento: "SALIDA", cantidad_neta: -3, costo_unitario: 2 },
    ],
    { stockActual: 7, precioInicial: 2 },
  );
  const visibles = filtrarPeriodo(kardex.filas, "2026-02-01", "2026-02-28");

  assert.equal(visibles[0].tipo_movimiento, "SALDO_ANTERIOR");
  assert.equal(visibles[0].saldo, 10);
  assert.equal(visibles[1].saldo, 7);
  assert.equal(kardex.saldo_final, 7);
});
