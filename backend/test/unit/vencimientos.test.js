require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clienteSql } = require("../helpers/clienteSql");
const { simularDb } = require("../helpers/entorno");
const vencidos = require("../../src/services/lotesVencidos");

const LOTES_VENCIDOS = { rows: [
  { id_lote: 1, numero_lote: "V-1", fecha_vencimiento: "2026-10-01", cantidad_actual: "3" },
  { id_lote: 2, numero_lote: "V-2", fecha_vencimiento: "2026-10-20", cantidad_actual: "6" },
] };

test("la condición de lote vencido incluye lo que vence hoy y excluye la cuarentena", () => {
  assert.match(vencidos.CONDICION_LOTE_VENCIDO, /fecha_vencimiento <= CURRENT_DATE/);
  assert.match(vencidos.CONDICION_LOTE_VENCIDO, /lp\.estado = 'VENCIDO'/);
  assert.doesNotMatch(vencidos.CONDICION_LOTE_VENCIDO, /CUARENTENA/);
});

test("marcarLotesVencidos y obtenerCantidadNoDisponible leen las funciones de la base", async () => {
  const c = clienteSql([
    ["fn_marcar_lotes_vencidos", { rows: [{ marcados: "4" }] }],
    ["fn_cantidad_no_disponible", { rows: [{ cantidad: "7" }] }],
  ]);
  assert.equal(await vencidos.marcarLotesVencidos(c), 4);
  assert.equal(await vencidos.obtenerCantidadNoDisponible(c, 1, 2), 7);
  assert.equal(await vencidos.obtenerCantidadNoDisponible(clienteSql(), 1, 2), 0);
});

test("baja por vencimiento sin lote: recorre los vencidos del más antiguo al más reciente", async () => {
  const c = clienteSql([["FROM lotes_productos lp", LOTES_VENCIDOS]]);
  const asignaciones = await vencidos.asignarLotesVencidos(c, { id_producto: 1, id_almacen: 2, cantidad: 5 });
  assert.deepEqual(asignaciones.map((a) => [a.lote.id_lote, a.cantidad]), [[1, 3], [2, 2]]);
  assert.match(c.consultas[0].sql, /FOR UPDATE/);
});

test("baja por vencimiento: falla si no hay suficientes unidades vencidas", async () => {
  const c = clienteSql([["FROM lotes_productos lp", LOTES_VENCIDOS]]);
  await assert.rejects(vencidos.asignarLotesVencidos(c, { id_producto: 1, id_almacen: 2, cantidad: 10 }), {
    statusCode: 400,
    message: /Vencidas: 9, solicitado: 10/,
  });
});

test("baja por vencimiento de un lote indicado: debe estar vencido y alcanzar", async () => {
  const c = () => clienteSql([["FROM lotes_productos lp", LOTES_VENCIDOS]]);
  const [a] = await vencidos.asignarLotesVencidos(c(), { id_producto: 1, id_almacen: 2, cantidad: 6, id_lote: 2 });
  assert.equal(a.lote.numero_lote, "V-2");
  await assert.rejects(vencidos.asignarLotesVencidos(c(), { id_producto: 1, id_almacen: 2, cantidad: 1, id_lote: 9 }), {
    message: /no está vencido/,
  });
  await assert.rejects(vencidos.asignarLotesVencidos(c(), { id_producto: 1, id_almacen: 2, cantidad: 4, id_lote: 1 }), {
    message: /solo tiene 3 unidades vencidas/,
  });
});

test("revisión de vencimientos: marca vencidos, genera alertas e informa a Logística", async () => {
  simularDb([
    { rows: [{ marcados: "2" }] }, // fn_marcar_lotes_vencidos
    { rows: [{ nuevas: "5" }] }, // fn_generar_alertas_vencimiento
    { rows: [] }, // BEGIN (informar próximos a vencer)
    { rows: [] }, // advisory lock
    { rows: [] }, // lotes en ventana: ninguno
    { rows: [] }, // COMMIT
  ]);
  const { generarAlertasVencimiento } = require("../../src/services/alertasVencimiento");
  const originalLog = console.log;
  console.log = () => {};
  try {
    const r = await generarAlertasVencimiento();
    assert.deepEqual(r, { nuevas: 5, informados: 0 });
  } finally {
    console.log = originalLog;
  }
});

test("revisión de vencimientos: un fallo al informar no impide las alertas", async () => {
  simularDb([{ rows: [{ marcados: "0" }] }, { rows: [{ nuevas: "1" }] }, new Error("pubsub caído")]);
  const { generarAlertasVencimiento } = require("../../src/services/alertasVencimiento");
  const originalError = console.error;
  console.error = () => {};
  try {
    const r = await generarAlertasVencimiento({ reenviarTodos: true });
    assert.deepEqual(r, { nuevas: 1, informados: 0 });
  } finally {
    console.error = originalError;
  }
});
