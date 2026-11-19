require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { simularDb } = require("../helpers/entorno");
const { validarMensajeVenta, procesarMensajeVenta, MensajeVentaInvalido } = require("../../src/services/suscriptorVentas");

const MENSAJE = {
  id_mensaje: "m-1",
  tipo_evento: "venta.confirmada",
  id_venta: "V-1",
  sucursal: "SUC-001",
  fecha: "2026-11-18T10:00:00Z",
  detalle: [{ codigo_producto: "PRD-001", cantidad: 2 }],
};

test("validarMensajeVenta normaliza un mensaje correcto", () => {
  const v = validarMensajeVenta({ ...MENSAJE, id_venta: 1001, sucursal: " SUC-001 " });
  assert.equal(v.id_venta, "1001");
  assert.equal(v.sucursal, "SUC-001");
  assert.equal(v.fecha, "2026-11-18T10:00:00.000Z");
});

test("validarMensajeVenta rechaza mensajes mal formados", () => {
  const casos = [
    [{ contenido_invalido: "{x" }, /objeto JSON/],
    [{ ...MENSAJE, tipo_evento: "venta.otra" }, /tipo_evento/],
    [{ ...MENSAJE, id_mensaje: "" }, /id_mensaje/],
    [{ ...MENSAJE, id_venta: "x".repeat(61) }, /id_venta/],
    [{ ...MENSAJE, sucursal: null }, /sucursal/],
    [{ ...MENSAJE, fecha: "ayer" }, /fecha/],
    [{ ...MENSAJE, detalle: [] }, /al menos una línea/],
    [{ ...MENSAJE, detalle: [{ codigo_producto: "", cantidad: 1 }] }, /codigo_producto/],
    [{ ...MENSAJE, detalle: [{ codigo_producto: "P", cantidad: 1.5 }] }, /entero positivo/],
  ];
  for (const [mensaje, error] of casos) {
    assert.throws(() => validarMensajeVenta(mensaje), (e) => e instanceof MensajeVentaInvalido && error.test(e.message));
  }
  // Una anulación no necesita detalle.
  validarMensajeVenta({ ...MENSAJE, tipo_evento: "venta.anulada", detalle: undefined });
});

test("un mensaje ya procesado no se vuelve a aplicar", async () => {
  const db = simularDb([{ rows: [] }, { rows: [], rowCount: 0 }, { rows: [] }]);
  const r = await procesarMensajeVenta(MENSAJE, { messageId: "ps-1" });
  assert.equal(r.duplicado, true);
  assert.equal(db.consultas.filter((c) => c.sql.includes("venta_recibida")).length, 0);
  assert.equal(db.liberado, true);
});

test("un mensaje inválido se guarda como INVALIDO con el motivo", async () => {
  const db = simularDb([{ rows: [] }, { rows: [{ id_mensaje: "m-2" }] }]);
  const r = await procesarMensajeVenta({ ...MENSAJE, id_mensaje: "m-2", detalle: [] }, { publicado: new Date() });
  assert.equal(r.estado, "INVALIDO");
  const actualizacion = db.consultas.find((c) => c.sql.includes("UPDATE mensajes_integracion"));
  assert.deepEqual(actualizacion.params.slice(2), ["INVALIDO", "detalle debe tener al menos una línea"]);
  assert.ok(db.consultas.some((c) => c.sql === "COMMIT"));
});

test("si falla la base se revierte y se lanza para que Pub/Sub reentregue", async () => {
  const db = simularDb([{ rows: [] }, new Error("conexión perdida")]);
  await assert.rejects(procesarMensajeVenta(MENSAJE), /conexión perdida/);
  assert.ok(db.consultas.some((c) => c.sql === "ROLLBACK"));
  assert.equal(db.liberado, true);
});
