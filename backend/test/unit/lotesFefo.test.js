require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clienteSql } = require("../helpers/clienteSql");
const { planificarFefo, asignarLotes, obtenerLotesVigentes } = require("../../src/services/lotesFefo");

// Lotes vigentes en orden FEFO (el que vence antes primero).
const LOTES = [
  { id_lote: 10, numero_lote: "L-A", fecha_vencimiento: "2026-12-01", cantidad_actual: "5" },
  { id_lote: 11, numero_lote: "L-B", fecha_vencimiento: "2027-01-15", cantidad_actual: "8" },
  { id_lote: 12, numero_lote: "L-C", fecha_vencimiento: "2027-03-01", cantidad_actual: "20" },
];
const conLotes = (lotes = LOTES) => clienteSql([["FROM lotes_productos", { rows: lotes }]]);

test("planificarFefo consume primero el lote que vence antes", () => {
  const { asignaciones, faltante } = planificarFefo(LOTES, 10);
  assert.deepEqual(
    asignaciones.map((a) => [a.lote.id_lote, a.cantidad]),
    [[10, 5], [11, 5]],
  );
  assert.equal(faltante, 0);
});

test("planificarFefo informa el faltante cuando no alcanza", () => {
  const { asignaciones, faltante } = planificarFefo(LOTES, 40);
  assert.equal(asignaciones.length, 3);
  assert.equal(faltante, 7);
  assert.deepEqual(planificarFefo([], 3), { asignaciones: [], faltante: 3 });
});

test("planificarFefo ignora lotes en cero y una cantidad cero no asigna nada", () => {
  const lotes = [{ id_lote: 1, cantidad_actual: "0" }, ...LOTES];
  assert.equal(planificarFefo(lotes, 3).asignaciones[0].lote.id_lote, 10);
  assert.deepEqual(planificarFefo(LOTES, 0).asignaciones, []);
});

test("obtenerLotesVigentes solo bloquea cuando se pide", async () => {
  const cliente = conLotes();
  await obtenerLotesVigentes(cliente, { id_producto: 1, id_almacen: 2 });
  await obtenerLotesVigentes(cliente, { id_producto: 1, id_almacen: 2, bloquear: true });
  assert.equal(cliente.consultas[0].sql.includes("FOR UPDATE"), false);
  assert.equal(cliente.consultas[1].sql.includes("FOR UPDATE"), true);
  assert.deepEqual(cliente.consultas[0].params, [1, 2]);
});

test("asignarLotes sin lote elegido aplica FEFO y marca cada lote como sugerido", async () => {
  const asignaciones = await asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 7 });
  assert.deepEqual(
    asignaciones.map((a) => [a.lote.id_lote, a.cantidad, a.id_lote_sugerido, a.justificacion_lote]),
    [
      [10, 5, 10, null],
      [11, 2, 11, null],
    ],
  );
});

test("asignarLotes rechaza cuando los lotes vigentes no alcanzan", async () => {
  await assert.rejects(asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 34 }), {
    statusCode: 400,
    message: /Disponible: 33, solicitado: 34/,
  });
});

test("asignarLotes con el lote sugerido no exige justificación", async () => {
  const [a] = await asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 3, id_lote: 10 });
  assert.equal(a.lote.id_lote, 10);
  assert.equal(a.justificacion_lote, null);
});

test("asignarLotes con otro lote exige justificación de al menos 5 caracteres", async () => {
  await assert.rejects(
    asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 3, id_lote: 12, justificacion_lote: "  ok " }),
    { statusCode: 400, message: /debe justificar/ },
  );
  const [a] = await asignarLotes(conLotes(), {
    id_producto: 1,
    id_almacen: 2,
    cantidad: 3,
    id_lote: 12,
    justificacion_lote: "Cliente pidió el lote más nuevo",
  });
  assert.equal(a.id_lote_sugerido, 10);
  assert.equal(a.justificacion_lote, "Cliente pidió el lote más nuevo");
});

test("asignarLotes rechaza un lote no vigente o sin cantidad suficiente", async () => {
  await assert.rejects(asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 1, id_lote: 99 }), {
    statusCode: 400,
    message: /no está vigente/,
  });
  await assert.rejects(asignarLotes(conLotes(), { id_producto: 1, id_almacen: 2, cantidad: 6, id_lote: 10 }), {
    statusCode: 400,
    message: /no tiene cantidad suficiente/,
  });
});
