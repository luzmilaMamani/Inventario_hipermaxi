const { randomUUID } = require("node:crypto");
const db = require("../config/db");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");
const {
  despacharSolicitud,
  procesarSolicitud,
  procesarTerminados,
} = require("../services/integracionProduccion");

const leerId = (valor) => {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(400, "La solicitud no es válida");
  }
  return id;
};

const listarSolicitudes = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const page = Math.max(Number(req.query.page || 1), 1);
  const valores = [];
  let whereSql = "";

  if (req.query.estado) {
    valores.push(req.query.estado);
    whereSql = "WHERE s.estado = $1";
  }

  const [datos, total] = await Promise.all([
    db.query(
      `SELECT s.*, a.nombre AS almacen, sa.numero_salida
       FROM solicitudes_materiales s
       INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
       LEFT JOIN salidas_inventario sa ON sa.id_salida = s.id_salida
       ${whereSql}
       ORDER BY s.fecha_recepcion DESC, s.id_solicitud DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, (page - 1) * limit],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM solicitudes_materiales s ${whereSql}`, valores),
  ]);

  res.json({ ok: true, data: datos.rows, pagination: { page, limit, total: total.rows[0].total } });
});

const obtenerSolicitud = asyncHandler(async (req, res) => {
  const id = leerId(req.params.id);
  const cabecera = await db.query(
    `SELECT s.*, a.nombre AS almacen, sa.numero_salida
     FROM solicitudes_materiales s
     INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
     LEFT JOIN salidas_inventario sa ON sa.id_salida = s.id_salida
     WHERE s.id_solicitud = $1`,
    [id],
  );
  if (!cabecera.rowCount) throw new ApiError(404, "Solicitud de materiales no encontrada");

  const detalles = await db.query(
    `SELECT d.*, p.codigo AS producto_codigo, p.nombre AS producto
     FROM detalle_solicitudes_materiales d
     INNER JOIN productos p ON p.id_producto = d.id_producto
     WHERE d.id_solicitud = $1
     ORDER BY d.id_producto`,
    [id],
  );

  res.json({ ok: true, data: { ...cabecera.rows[0], detalles: detalles.rows } });
});

const despachar = asyncHandler(async (req, res) => {
  const data = await despacharSolicitud(leerId(req.params.id), req.user.id_usuario);
  res.json({ ok: true, message: "Despacho confirmado y stock actualizado", data });
});

const listarEventos = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const page = Math.max(Number(req.query.page || 1), 1);

  const [datos, total] = await Promise.all([
    db.query(
      `SELECT id_evento, tipo_evento, payload, estado, intentos, message_id, ultimo_error,
              fecha_creacion, fecha_publicacion
       FROM eventos_integracion
       ORDER BY id_evento DESC
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    ),
    db.query("SELECT COUNT(*)::int AS total FROM eventos_integracion"),
  ]);

  res.json({ ok: true, data: datos.rows, pagination: { page, limit, total: total.rows[0].total } });
});

// Entrega un mensaje al mismo procesamiento que usa la suscripción de Pub/Sub,
// para simular a Producción y Logística sin depender de Google Cloud.
const simularMensaje = (procesar) =>
  asyncHandler(async (req, res) => {
    if (env.nodeEnv === "production") {
      throw new ApiError(403, "La simulación no está disponible en producción");
    }
    const idMensaje = randomUUID();
    await procesar({ ...req.body, id_mensaje: idMensaje }, idMensaje);
    res.status(202).json({ ok: true, message: "Mensaje simulado procesado", data: { id_mensaje: idMensaje } });
  });

module.exports = {
  listarSolicitudes,
  obtenerSolicitud,
  despachar,
  listarEventos,
  simularSolicitud: simularMensaje(procesarSolicitud),
  simularTerminados: simularMensaje(procesarTerminados),
};
