const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { tiposDisponibles } = require("../services/reportesProgramables");
const { correoConfigurado } = require("../services/correo");
const {
  FRECUENCIAS,
  TIPOS_REPORTE,
  calcularProximoEnvio,
  ejecutarProgramacion,
} = require("../services/envioReportes");

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SELECT_PROGRAMACION = `
  SELECT pr.*,
         TO_CHAR(pr.hora, 'HH24:MI') AS hora,
         u.nombre_completo AS creado_por,
         ue.estado AS ultimo_estado,
         ue.mensaje_error AS ultimo_error,
         ue.fecha_envio AS ultima_fecha_bitacora
  FROM programaciones_reporte pr
  LEFT JOIN usuarios u ON u.id_usuario = pr.id_usuario_crea
  LEFT JOIN LATERAL (
    SELECT estado, mensaje_error, fecha_envio
    FROM bitacora_envios_reporte b
    WHERE b.id_programacion = pr.id_programacion
    ORDER BY b.fecha_envio DESC, b.id_envio DESC
    LIMIT 1
  ) ue ON TRUE`;

function validarProgramacion(body) {
  const nombre = String(body.nombre || "").trim();
  if (nombre.length < 3) throw new ApiError(400, "El nombre debe tener al menos 3 caracteres");
  if (!TIPOS_REPORTE.includes(body.tipo_reporte)) throw new ApiError(400, "El tipo de reporte no es válido");
  if (!FRECUENCIAS.includes(body.frecuencia)) {
    throw new ApiError(400, "La frecuencia debe ser DIARIA, SEMANAL o MENSUAL");
  }

  const hora = String(body.hora || "07:00").slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new ApiError(400, "La hora no es válida (HH:MM)");

  let diaSemana = null;
  let diaMes = null;
  if (body.frecuencia === "SEMANAL") {
    diaSemana = Number(body.dia_semana);
    if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) {
      throw new ApiError(400, "Elija el día de la semana del envío");
    }
  }
  if (body.frecuencia === "MENSUAL") {
    diaMes = Number(body.dia_mes);
    if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 28) {
      throw new ApiError(400, "El día del mes debe estar entre 1 y 28");
    }
  }

  const lista = Array.isArray(body.destinatarios)
    ? body.destinatarios
    : String(body.destinatarios || "").split(/[,;\s]+/);
  const destinatarios = [...new Set(lista.map((c) => String(c).trim().toLowerCase()).filter(Boolean))];
  if (destinatarios.length === 0) throw new ApiError(400, "Indique al menos un destinatario");
  if (destinatarios.length > 20) throw new ApiError(400, "Se permiten hasta 20 destinatarios");
  const invalido = destinatarios.find((c) => !CORREO.test(c));
  if (invalido) throw new ApiError(400, `El correo ${invalido} no es válido`);

  const parametros = {};
  if (body.parametros?.id_almacen) {
    const id = Number(body.parametros.id_almacen);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "El almacén no es válido");
    parametros.id_almacen = id;
  }

  return {
    nombre,
    tipo_reporte: body.tipo_reporte,
    frecuencia: body.frecuencia,
    hora,
    dia_semana: diaSemana,
    dia_mes: diaMes,
    destinatarios,
    parametros,
    activo: body.activo === undefined ? true : Boolean(body.activo),
  };
}

const idDe = (req) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "La programación no es válida");
  return id;
};

async function buscar(id) {
  const { rows } = await db.query(`${SELECT_PROGRAMACION} WHERE pr.id_programacion = $1`, [id]);
  if (!rows.length) throw new ApiError(404, "Programación no encontrada");
  return rows[0];
}

const listarTipos = asyncHandler(async (_req, res) => {
  res.json({
    ok: true,
    data: tiposDisponibles(),
    frecuencias: FRECUENCIAS,
    correo_configurado: correoConfigurado(),
  });
});

const listarProgramaciones = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(`${SELECT_PROGRAMACION} ORDER BY pr.activo DESC, pr.proximo_envio ASC`);
  res.json({ ok: true, data: rows });
});

const crearProgramacion = asyncHandler(async (req, res) => {
  const p = validarProgramacion(req.body);
  const { rows } = await db.query(
    `INSERT INTO programaciones_reporte
       (nombre, tipo_reporte, frecuencia, hora, dia_semana, dia_mes, destinatarios,
        parametros, activo, proximo_envio, id_usuario_crea)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id_programacion`,
    [
      p.nombre, p.tipo_reporte, p.frecuencia, p.hora, p.dia_semana, p.dia_mes, p.destinatarios,
      p.parametros, p.activo, calcularProximoEnvio(p), req.user.id_usuario,
    ],
  );
  res.status(201).json({
    ok: true,
    message: "Programación creada",
    data: await buscar(rows[0].id_programacion),
  });
});

const actualizarProgramacion = asyncHandler(async (req, res) => {
  const id = idDe(req);
  await buscar(id);
  const p = validarProgramacion(req.body);
  await db.query(
    `UPDATE programaciones_reporte
     SET nombre = $1, tipo_reporte = $2, frecuencia = $3, hora = $4, dia_semana = $5,
         dia_mes = $6, destinatarios = $7, parametros = $8, activo = $9,
         proximo_envio = $10, fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id_programacion = $11`,
    [
      p.nombre, p.tipo_reporte, p.frecuencia, p.hora, p.dia_semana, p.dia_mes, p.destinatarios,
      p.parametros, p.activo, calcularProximoEnvio(p), id,
    ],
  );
  res.json({ ok: true, message: "Programación actualizada", data: await buscar(id) });
});

// Activar o desactivar sin tocar el resto. Al reactivar se recalcula la
// próxima fecha para no enviar de golpe lo atrasado.
const cambiarEstado = asyncHandler(async (req, res) => {
  const id = idDe(req);
  const actual = await buscar(id);
  if (typeof req.body.activo !== "boolean") throw new ApiError(400, "Indique activo: true o false");
  await db.query(
    `UPDATE programaciones_reporte
     SET activo = $1, proximo_envio = $2, fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id_programacion = $3`,
    [req.body.activo, req.body.activo ? calcularProximoEnvio(actual) : actual.proximo_envio, id],
  );
  res.json({
    ok: true,
    message: req.body.activo ? "Programación activada" : "Programación desactivada",
    data: await buscar(id),
  });
});

const enviarAhora = asyncHandler(async (req, res) => {
  const id = idDe(req);
  const programacion = await buscar(id);
  const envio = await ejecutarProgramacion(programacion, { manual: true, idUsuario: req.user.id_usuario });
  res.status(envio.estado === "ENVIADO" ? 200 : 502).json({
    ok: envio.estado === "ENVIADO",
    message: envio.estado === "ENVIADO" ? "Reporte enviado" : `No se pudo enviar: ${envio.mensaje_error}`,
    data: envio,
  });
});

const listarEnvios = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const valores = [];
  let where = "";
  if (req.params.id) {
    valores.push(idDe(req));
    where = "WHERE b.id_programacion = $1";
  }
  const { rows } = await db.query(
    `SELECT b.*, pr.nombre, pr.tipo_reporte, u.nombre_completo AS usuario
     FROM bitacora_envios_reporte b
     INNER JOIN programaciones_reporte pr ON pr.id_programacion = b.id_programacion
     LEFT JOIN usuarios u ON u.id_usuario = b.id_usuario
     ${where}
     ORDER BY b.fecha_envio DESC, b.id_envio DESC
     LIMIT ${limit}`,
    valores,
  );
  res.json({ ok: true, data: rows });
});

module.exports = {
  listarTipos,
  listarProgramaciones,
  crearProgramacion,
  actualizarProgramacion,
  cambiarEstado,
  enviarAhora,
  listarEnvios,
};
