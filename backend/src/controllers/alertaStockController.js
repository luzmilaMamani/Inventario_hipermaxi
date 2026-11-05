const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const TIPOS = ["PUNTO_REPOSICION", "STOCK_MINIMO"];
const ESTADOS = ["ABIERTA", "CERRADA"];

const CONSULTA = `
  SELECT
    al.id_alerta,
    al.tipo,
    al.estado,
    al.fecha_alerta,
    al.fecha_cierre,
    p.id_producto,
    p.codigo AS producto_codigo,
    p.nombre AS producto,
    a.id_almacen,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen,
    COALESCE(s.cantidad, 0) AS cantidad_actual,
    p.stock_minimo,
    p.punto_reposicion
  FROM alertas_stock al
  INNER JOIN productos p ON p.id_producto = al.id_producto
  INNER JOIN almacenes a ON a.id_almacen = al.id_almacen
  LEFT JOIN stock s ON s.id_producto = al.id_producto AND s.id_almacen = al.id_almacen
`;

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

  const estado = req.query.estado || "ABIERTA";
  if (estado !== "TODAS") {
    if (!ESTADOS.includes(estado)) throw new ApiError(400, "El estado de la alerta no es válido");
    valores.push(estado);
    condiciones.push(`al.estado = $${valores.length}`);
  }
  if (req.query.tipo) {
    if (!TIPOS.includes(req.query.tipo)) throw new ApiError(400, "El tipo de alerta no es válido");
    valores.push(req.query.tipo);
    condiciones.push(`al.tipo = $${valores.length}`);
  }
  if (req.query.id_almacen) {
    const idAlmacen = leerEnteroPositivo(req.query.id_almacen, "El almacén no es válido");
    valores.push(idAlmacen);
    condiciones.push(`al.id_almacen = $${valores.length}`);
  }
  if (req.query.id_producto) {
    const idProducto = leerEnteroPositivo(req.query.id_producto, "El producto no es válido");
    valores.push(idProducto);
    condiciones.push(`al.id_producto = $${valores.length}`);
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const [dataResult, countResult] = await Promise.all([
    db.query(
      `${CONSULTA}
       ${whereSql}
       ORDER BY al.fecha_alerta DESC, al.id_alerta DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM alertas_stock al
       ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

module.exports = { listarAlertas };
