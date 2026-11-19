require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analizarRotacion, calcularRotacion } = require("../../src/services/rotacion");

const fila = (id, salidas, promedio, precio = 10) => ({
  id_producto: id,
  codigo: `P-${id}`,
  unidades_salida: String(salidas),
  stock_promedio: String(promedio),
  stock_inicial: "0",
  stock_final: "0",
  valor_salida: String(salidas * precio),
  precio: String(precio),
});

test("calcularRotacion: rotación, rotación mensual y días de inventario", () => {
  const r = calcularRotacion(fila(1, 60, 30), 90);
  assert.equal(r.rotacion_periodo, 2);
  assert.equal(r.rotacion_mensual, 0.667);
  assert.equal(r.dias_inventario, 45);
});

test("calcularRotacion: sin salidas no hay días de inventario; sin stock promedio pero con salidas no hay índice", () => {
  assert.deepEqual(
    [calcularRotacion(fila(1, 0, 30), 30).rotacion_periodo, calcularRotacion(fila(1, 0, 30), 30).dias_inventario],
    [0, null],
  );
  const r = calcularRotacion(fila(1, 5, 0), 30);
  assert.equal(r.rotacion_periodo, null);
  assert.equal(r.dias_inventario, null);
});

test("analizarRotacion clasifica por tercios entre los productos con salidas", () => {
  const { data, resumen } = analizarRotacion(
    [fila(1, 90, 10), fila(2, 60, 10), fila(3, 30, 10), fila(4, 3, 10), fila(5, 0, 50), fila(6, 0, 0)],
    30,
  );
  const clase = Object.fromEntries(data.map((f) => [f.id_producto, f.clasificacion]));
  assert.deepEqual(clase, { 1: "ALTA", 2: "ALTA", 3: "MEDIA", 4: "BAJA", 5: "SIN_MOVIMIENTO", 6: "SIN_STOCK" });
  assert.deepEqual(data.slice(0, 4).map((f) => f.posicion), [1, 2, 3, 4]);
  assert.equal(resumen.sin_movimiento, 1);
  assert.equal(resumen.valor_sin_movimiento, 500);
  // 183 unidades / 90 de stock promedio en 30 días.
  assert.equal(resumen.rotacion_mensual_global, 2.033);
  assert.equal(resumen.dias_inventario_global, 14.8);
});

test("analizarRotacion sin datos devuelve un resumen vacío", () => {
  const { data, resumen } = analizarRotacion([], 30);
  assert.deepEqual(data, []);
  assert.equal(resumen.rotacion_mensual_global, null);
  assert.equal(resumen.dias_inventario_global, null);
});
