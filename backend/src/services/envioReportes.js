const db = require("../config/db");
const env = require("../config/env");
const { generarReporte, TIPOS } = require("./reportesProgramables");
const { generarPdfReporte } = require("./reportePdf");
const { enviarCorreo } = require("./correo");

// RF70: envío automático de reportes programados.

const FRECUENCIAS = ["DIARIA", "SEMANAL", "MENSUAL"];

function conHora(fecha, hora) {
  const [h, m] = String(hora || "07:00").split(":").map(Number);
  const resultado = new Date(fecha);
  resultado.setHours(h || 0, m || 0, 0, 0);
  return resultado;
}

// Próxima fecha de envío estrictamente posterior a `desde` (hora local del
// servidor). dia_semana: 1 = lunes ... 7 = domingo; dia_mes: 1 a 28.
function calcularProximoEnvio({ frecuencia, hora, dia_semana: diaSemana, dia_mes: diaMes }, desde = new Date()) {
  if (frecuencia === "DIARIA") {
    const hoy = conHora(desde, hora);
    if (hoy > desde) return hoy;
    hoy.setDate(hoy.getDate() + 1);
    return hoy;
  }
  if (frecuencia === "SEMANAL") {
    const objetivo = Number(diaSemana) % 7; // getDay(): 0 = domingo
    const candidato = conHora(desde, hora);
    candidato.setDate(candidato.getDate() + ((objetivo - candidato.getDay() + 7) % 7));
    if (candidato <= desde) candidato.setDate(candidato.getDate() + 7);
    return candidato;
  }
  if (frecuencia === "MENSUAL") {
    const candidato = conHora(new Date(desde.getFullYear(), desde.getMonth(), Number(diaMes)), hora);
    if (candidato <= desde) candidato.setMonth(candidato.getMonth() + 1);
    return candidato;
  }
  throw new Error(`Frecuencia no válida: ${frecuencia}`);
}

const FRECUENCIA_TEXTO = { DIARIA: "diario", SEMANAL: "semanal", MENSUAL: "mensual" };

// Genera el PDF, lo envía y deja el resultado en la bitácora. Nunca lanza: el
// error queda registrado para que se pueda revisar y reenviar.
async function ejecutarProgramacion(programacion, { manual = false, idUsuario = null } = {}) {
  let estado = "ENVIADO";
  let mensajeError = null;
  let registros = null;

  try {
    const reporte = await generarReporte(programacion.tipo_reporte, programacion.parametros, {
      frecuencia: programacion.frecuencia,
    });
    registros = reporte.filas.length;
    const pdf = await generarPdfReporte(reporte);
    const fecha = new Date().toISOString().slice(0, 10);
    await enviarCorreo({
      para: programacion.destinatarios,
      asunto: `[Hipermaxi] ${reporte.titulo} - ${fecha}`,
      texto:
        `Adjuntamos el reporte "${programacion.nombre}" (${FRECUENCIA_TEXTO[programacion.frecuencia]}).\n` +
        `${reporte.subtitulo}\nRegistros: ${registros}\n\n` +
        "Este correo se envía automáticamente desde el Sistema de Inventarios Chuby Hipermaxi.",
      adjuntos: [
        {
          filename: `${programacion.tipo_reporte.toLowerCase()}_${fecha}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    estado = "ERROR";
    mensajeError = error.message || String(error);
  }

  const { rows } = await db.query(
    `INSERT INTO bitacora_envios_reporte
       (id_programacion, estado, destinatarios, registros, manual, id_usuario, mensaje_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [programacion.id_programacion, estado, programacion.destinatarios, registros, manual, idUsuario, mensajeError],
  );
  await db.query(
    "UPDATE programaciones_reporte SET ultimo_envio = CURRENT_TIMESTAMP WHERE id_programacion = $1",
    [programacion.id_programacion],
  );
  return rows[0];
}

// Toma las programaciones vencidas, les adelanta la próxima fecha dentro de una
// transacción (SKIP LOCKED evita que dos instancias envíen la misma) y después
// las envía.
async function procesarPendientes() {
  const client = await db.pool.connect();
  let pendientes = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM programaciones_reporte
       WHERE activo = TRUE AND proximo_envio <= CURRENT_TIMESTAMP
       ORDER BY proximo_envio
       LIMIT 20
       FOR UPDATE SKIP LOCKED`,
    );
    for (const programacion of rows) {
      await client.query(
        "UPDATE programaciones_reporte SET proximo_envio = $1 WHERE id_programacion = $2",
        [calcularProximoEnvio(programacion), programacion.id_programacion],
      );
    }
    await client.query("COMMIT");
    pendientes = rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const resultados = [];
  for (const programacion of pendientes) {
    resultados.push(await ejecutarProgramacion(programacion));
  }
  return resultados;
}

let temporizador = null;

function iniciarEnvioReportes() {
  if (temporizador) return;
  const segundos = env.reportesProgramadosIntervaloSeg;
  if (!(segundos > 0)) {
    console.log("Envío programado de reportes desactivado");
    return;
  }
  const ejecutar = async () => {
    try {
      const resultados = await procesarPendientes();
      for (const r of resultados) {
        console.log(`Reporte programado ${r.id_programacion}: ${r.estado}${r.mensaje_error ? ` (${r.mensaje_error})` : ""}`);
      }
    } catch (error) {
      console.error("Error al procesar reportes programados:", error.message);
    }
  };
  temporizador = setInterval(ejecutar, segundos * 1000);
  temporizador.unref?.();
  ejecutar();
}

module.exports = {
  FRECUENCIAS,
  TIPOS_REPORTE: Object.keys(TIPOS),
  calcularProximoEnvio,
  ejecutarProgramacion,
  procesarPendientes,
  iniciarEnvioReportes,
};
