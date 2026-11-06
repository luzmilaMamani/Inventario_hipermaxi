const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { generarAlertasVencimiento } = require("../services/alertasVencimiento");

const TIPOS = ["POR_VENCER", "VENCIDO"];
const ESTADOS = ["PENDIENTE", "LEIDA"];

function leerEnteroPositivo(valor, mensaje) {
  const numero = Number(valor);
  if (typeof valor === "boolean" || !Number.isSafeInteger(numero) || numero <= 0) {
    throw new ApiError(400, mensaje);
  }
  return numero;
}

const listarAlertas = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const condiciones = [];
  const valores = [];

  const estado = req.query.estado || "PENDIENTE";
  if (estado !== "TODAS") {
    if (!ESTADOS.includes(estado)) throw new ApiError(400, "El estado de la alerta no es válido");
    valores.push(estado);
    condiciones.push(`av.estado = $${valores.length}`);
  }
  if (req.query.tipo) {
    if (!TIPOS.includes(req.query.tipo)) throw new ApiError(400, "El tipo de alerta no es válido");
    valores.push(req.query.tipo);
    condiciones.push(`av.tipo = $${valores.length}`);
  }
  if (req.query.id_almacen) {
    valores.push(leerEnteroPositivo(req.query.id_almacen, "El almacén no es válido"));
    condiciones.push(`av.id_almacen = $${valores.length}`);
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         av.id_alerta,
         av.tipo,
         av.estado,
         av.fecha_generacion,
         av.fecha_lectura,
         av.dias_anticipacion,
         TO_CHAR(av.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         (av.fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
         COALESCE(lp.cantidad_actual, av.cantidad) AS cantidad,
         lp.id_lote,
         lp.numero_lote,
         p.id_producto,
         p.codigo AS producto_codigo,
         p.nombre AS producto,
         c.nombre AS categoria,
         um.abreviatura AS unidad,
         a.id_almacen,
         a.codigo AS almacen_codigo,
         a.nombre AS almacen,
         u.nombre_completo AS leida_por
       FROM alertas_vencimiento av
       INNER JOIN productos p ON p.id_producto = av.id_producto
       INNER JOIN almacenes a ON a.id_almacen = av.id_almacen
       LEFT JOIN lotes_productos lp ON lp.id_lote = av.id_lote
       LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
       LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
       LEFT JOIN usuarios u ON u.id_usuario = av.id_usuario_lectura
       ${whereSql}
       ORDER BY (av.tipo = 'VENCIDO') DESC, av.fecha_vencimiento ASC, av.id_alerta DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM alertas_vencimiento av ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const resumenAlertas = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE tipo = 'POR_VENCER')::int AS por_vencer,
       COUNT(*) FILTER (WHERE tipo = 'VENCIDO')::int AS vencidas,
       COUNT(*)::int AS pendientes
     FROM alertas_vencimiento
     WHERE estado = 'PENDIENTE'`,
  );
  res.json({ ok: true, data: rows[0] });
});

const marcarLeida = asyncHandler(async (req, res) => {
  const id = leerEnteroPositivo(req.params.id, "La alerta no es válida");
  const { rows } = await db.query(
    `UPDATE alertas_vencimiento
     SET estado = 'LEIDA',
         fecha_lectura = COALESCE(fecha_lectura, CURRENT_TIMESTAMP),
         id_usuario_lectura = COALESCE(id_usuario_lectura, $2)
     WHERE id_alerta = $1
     RETURNING id_alerta, estado, fecha_lectura`,
    [id, req.user?.id_usuario || null],
  );
  if (!rows.length) throw new ApiError(404, "Alerta no encontrada");
  res.json({ ok: true, message: "Alerta marcada como leída", data: rows[0] });
});

const marcarVariasLeidas = asyncHandler(async (req, res) => {
  const ids = req.body?.ids;
  const valores = [req.user?.id_usuario || null];
  let filtro = "";

  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, "Debe indicar al menos una alerta");
    }
    valores.push(ids.map((id) => leerEnteroPositivo(id, "La alerta no es válida")));
    filtro = "AND id_alerta = ANY($2::int[])";
  }

  const resultado = await db.query(
    `UPDATE alertas_vencimiento
     SET estado = 'LEIDA',
         fecha_lectura = CURRENT_TIMESTAMP,
         id_usuario_lectura = $1
     WHERE estado = 'PENDIENTE' ${filtro}`,
    valores,
  );
  res.json({
    ok: true,
    message: `${resultado.rowCount} alerta(s) marcada(s) como leída(s)`,
    data: { actualizadas: resultado.rowCount },
  });
});

const generarAhora = asyncHandler(async (_req, res) => {
  const nuevas = await generarAlertasVencimiento();
  res.json({
    ok: true,
    message: nuevas ? `Se generaron ${nuevas} alerta(s) nueva(s)` : "No hay alertas nuevas",
    data: { nuevas },
  });
});

module.exports = {
  listarAlertas,
  resumenAlertas,
  marcarLeida,
  marcarVariasLeidas,
  generarAhora,
};
