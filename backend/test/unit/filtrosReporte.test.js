require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { crearFiltros, esFechaValida } = require("../../src/utils/filtrosReporte");

test("esFechaValida acepta solo fechas reales en formato YYYY-MM-DD", () => {
  assert.equal(esFechaValida("2026-11-18"), true);
  assert.equal(esFechaValida("2026-02-29"), false);
  assert.equal(esFechaValida("2026-13-01"), false);
  assert.equal(esFechaValida("18/11/2026"), false);
  assert.equal(esFechaValida(undefined), false);
});

test("crearFiltros numera los parámetros en orden", () => {
  const f = crearFiltros();
  f.id("3", "id_almacen", "almacén inválido");
  f.opcion("ACTIVO", "estado", ["ACTIVO", "INACTIVO"], "estado inválido");
  f.agregar("(nombre ILIKE ? OR codigo ILIKE ?)", "%arroz%");
  assert.equal(f.where(), "WHERE id_almacen = $1 AND estado = $2 AND (nombre ILIKE $3 OR codigo ILIKE $3)");
  assert.deepEqual(f.valores, [3, "ACTIVO", "%arroz%"]);
});

test("crearFiltros ignora filtros vacíos y agrega condiciones extra", () => {
  const f = crearFiltros();
  f.id("", "id_almacen", "x");
  f.id(undefined, "id_categoria", "x");
  f.opcion(null, "estado", ["A"], "x");
  assert.equal(f.where(), "");
  assert.equal(f.where(["cantidad > 0"]), "WHERE cantidad > 0");
});

test("crearFiltros rechaza ids y opciones inválidas con error 400", () => {
  const f = crearFiltros();
  assert.throws(() => f.id("abc", "id_almacen", "El almacén no es válido"), {
    statusCode: 400,
    message: "El almacén no es válido",
  });
  assert.throws(() => f.id("-2", "id_almacen", "x"), { statusCode: 400 });
  assert.throws(() => f.opcion("OTRO", "estado", ["ACTIVO"], "estado inválido"), { statusCode: 400 });
});

test("rangoFechas incluye todo el día final y valida el orden", () => {
  const f = crearFiltros();
  f.rangoFechas("2026-11-01", "2026-11-18", "fecha");
  assert.equal(f.where(), "WHERE fecha >= $1::date AND fecha < $2::date + INTERVAL '1 day'");
  assert.throws(() => crearFiltros().rangoFechas("2026-11-18", "2026-11-01", "fecha"), { statusCode: 400 });
  assert.throws(() => crearFiltros().rangoFechas("2026-99-01", null, "fecha"), { statusCode: 400 });
});
