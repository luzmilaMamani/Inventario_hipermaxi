const path = require("node:path");
require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { simularDb } = require("../helpers/entorno");

// Correo simulado: se registra antes de cargar los servicios que lo usan.
const correosEnviados = [];
let fallarCorreo = null;
const rutaCorreo = path.resolve(__dirname, "../../src/services/correo.js");
require.cache[rutaCorreo] = {
  id: rutaCorreo,
  filename: rutaCorreo,
  loaded: true,
  exports: {
    correoConfigurado: () => true,
    enviarCorreo: async (correo) => {
      if (fallarCorreo) throw fallarCorreo;
      correosEnviados.push(correo);
      return "id-falso";
    },
  },
};

const { obtenerIndicadores } = require("../../src/services/indicadores");
const { generarReporte, tiposDisponibles } = require("../../src/services/reportesProgramables");
const { generarPdfReporte } = require("../../src/services/reportePdf");
const { ejecutarProgramacion, procesarPendientes } = require("../../src/services/envioReportes");

// Responde según la consulta que hace el servicio de indicadores.
function respuestasIndicadores(sql) {
  if (sql.includes("neto_desde_inicio")) {
    return { rows: [{ valor_actual: "1000", valor_inicio: "800", valor_fin: "1000", costo_vendido: "450", valor_merma: "18", unidades_merma: "3" }] };
  }
  if (sql.includes("en_quiebre")) return { rows: [{ registros: 20, en_quiebre: 3 }] };
  if (sql.includes("vw_conteos_inventario")) return { rows: [{ lineas: 40, exactas: 36, inventarios: 2 }] };
  if (sql.includes("CURRENT_DATE + 30")) return { rows: [{ lotes: 4, unidades: "60", valor: "250.5" }] };
  if (sql.includes("vw_recepciones_cumplimiento")) return { rows: [{ recepciones: 0, sin_diferencia: 0 }] };
  if (sql.includes("GROUP BY a.id_almacen")) return { rows: [{ id_almacen: 1, almacen: "Central", valor: "1000" }] };
  if (sql.includes("TO_CHAR(fecha_movimiento::date")) return { rows: [{ dia: "2026-11-01", entradas: "10", salidas: "4" }] };
  return { rows: [] };
}

test("indicadores: calcula los 7 KPIs con sus fórmulas", async () => {
  simularDb(Array.from({ length: 8 }, () => respuestasIndicadores));
  const { kpis, periodo, graficos } = await obtenerIndicadores({ idAlmacen: 2, desde: "2026-11-01", hasta: "2026-11-30" });
  const kpi = Object.fromEntries(kpis.map((k) => [k.codigo, k]));

  assert.equal(periodo.dias, 30);
  assert.equal(kpi.VALOR_INVENTARIO.valor, 1000);
  // Rotación: 450 / ((800 + 1000) / 2) = 0,5 en 30 días → 0,5 por mes; 60 días de inventario.
  assert.equal(kpi.ROTACION.valor, 0.5);
  assert.equal(kpi.ROTACION.detalle.dias_inventario, 60);
  assert.equal(kpi.QUIEBRE_STOCK.valor, 15);
  assert.equal(kpi.MERMA.valor, 2); // 18 / 900
  assert.equal(kpi.EXACTITUD.valor, 90);
  assert.equal(kpi.VALOR_RIESGO_VENCIMIENTO.valor, 250.5);
  assert.equal(kpi.CUMPLIMIENTO_PROVEEDORES.valor, null, "sin recepciones no hay porcentaje");
  assert.equal(kpis.length, 7);
  assert.deepEqual(graficos.movimientos_por_dia, [{ dia: "2026-11-01", entradas: 10, salidas: 4 }]);
});

test("reportes programables: cada tipo genera columnas y filas", async () => {
  const fila = { producto_codigo: "P1", producto: "Arroz", almacen: "Central", cantidad_total: "5", cantidad_reservada: "0",
    cantidad_disponible: "5", valor_total: "50", stock_minimo: "10", fecha: "2026-11-01", motivo: "DANO", cantidad: "1",
    valor: "10", numero_lote: "L1", fecha_vencimiento: "2026-11-10", dias_restantes: -2, cantidad_actual: "3" };
  assert.equal(tiposDisponibles().length, 5);

  for (const tipo of ["EXISTENCIAS", "STOCK_BAJO", "PERDIDAS", "VENCIMIENTOS_LOTES"]) {
    simularDb([
      (sql) => (sql.includes("FROM almacenes") ? { rows: [{ nombre: "Central" }] } : { rows: [fila] }),
      (sql) => (sql.includes("FROM almacenes") ? { rows: [{ nombre: "Central" }] } : { rows: [fila] }),
    ]);
    const reporte = await generarReporte(tipo, { id_almacen: 1 }, { frecuencia: "SEMANAL" });
    assert.ok(reporte.titulo, tipo);
    assert.equal(reporte.filas.length, 1, tipo);
    assert.ok(reporte.columnas.every((c) => c.key && c.label), tipo);
  }

  simularDb(Array.from({ length: 8 }, () => respuestasIndicadores));
  const kpis = await generarReporte("INDICADORES", {}, { frecuencia: "MENSUAL" });
  assert.equal(kpis.filas.length, 7);
  assert.equal(kpis.subtitulo.startsWith("Todas las sucursales"), true);
  await assert.rejects(generarReporte("NO_EXISTE"), /no soportado/);
});

test("PDF de reporte: genera un PDF válido y pagina tablas largas", async () => {
  const columnas = [{ key: "a", label: "Texto", ancho: 200 }, { key: "b", label: "Valor", tipo: "moneda" }];
  const corto = await generarPdfReporte({ titulo: "T", columnas, filas: [], resumen: [{ label: "Total", valor: 0, tipo: "moneda" }] });
  assert.equal(corto.subarray(0, 5).toString(), "%PDF-");

  const filas = Array.from({ length: 120 }, (_, i) => ({ a: `Fila ${i}`, b: i * 1.5 }));
  const largo = await generarPdfReporte({ titulo: "Largo", subtitulo: "x", columnas, filas });
  const paginas = (largo.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
  assert.ok(paginas >= 3, `se esperaban varias páginas, hubo ${paginas}`);
});

const PROGRAMACION = {
  id_programacion: 4,
  nombre: "Stock bajo diario",
  tipo_reporte: "STOCK_BAJO",
  frecuencia: "DIARIA",
  hora: "07:00",
  destinatarios: ["gerente@hipermaxi.test"],
  parametros: {},
};

test("envío programado: genera el PDF, lo envía y registra ENVIADO en la bitácora", async () => {
  correosEnviados.length = 0;
  fallarCorreo = null;
  const db = simularDb([
    { rows: [{ producto_codigo: "P1", producto: "Arroz", almacen: "Central", cantidad_disponible: "1", stock_minimo: "5" }] },
    (sql, params) => ({ rows: [{ id_envio: 1, estado: params[1], registros: params[3], mensaje_error: params[6] }] }),
  ]);
  const envio = await ejecutarProgramacion(PROGRAMACION, { manual: true, idUsuario: 5 });
  assert.equal(envio.estado, "ENVIADO");
  assert.equal(envio.registros, 1);
  assert.equal(correosEnviados.length, 1);
  assert.deepEqual(correosEnviados[0].para, ["gerente@hipermaxi.test"]);
  assert.equal(correosEnviados[0].adjuntos[0].contentType, "application/pdf");
  assert.ok(db.consultas.some((c) => c.sql.includes("ultimo_envio = CURRENT_TIMESTAMP")));
});

test("envío programado: si el correo falla queda ERROR con el motivo, sin lanzar", async () => {
  fallarCorreo = new Error("SMTP rechazó la conexión");
  simularDb([
    { rows: [] },
    (sql, params) => ({ rows: [{ estado: params[1], mensaje_error: params[6] }] }),
  ]);
  const envio = await ejecutarProgramacion(PROGRAMACION);
  assert.equal(envio.estado, "ERROR");
  assert.equal(envio.mensaje_error, "SMTP rechazó la conexión");
  fallarCorreo = null;
});

test("procesarPendientes adelanta la próxima fecha en la transacción y luego envía", async () => {
  correosEnviados.length = 0;
  const db = simularDb([
    { rows: [] }, // BEGIN
    { rows: [PROGRAMACION] }, // pendientes (FOR UPDATE SKIP LOCKED)
    { rows: [] }, // UPDATE proximo_envio
    { rows: [] }, // COMMIT
    { rows: [] }, // reporte sin filas
    (sql, params) => ({ rows: [{ estado: params[1] }] }),
  ]);
  const resultados = await procesarPendientes();
  assert.equal(resultados.length, 1);
  assert.ok(db.consultas[1].sql.includes("SKIP LOCKED"));
  assert.ok(db.consultas[2].params[0] instanceof Date);
  assert.equal(correosEnviados.length, 1);
  assert.equal(db.liberado, true);
});

test("procesarPendientes revierte si falla la consulta de pendientes", async () => {
  const db = simularDb([{ rows: [] }, new Error("base caída")]);
  await assert.rejects(procesarPendientes(), /base caída/);
  assert.ok(db.consultas.some((c) => c.sql === "ROLLBACK"));
});
