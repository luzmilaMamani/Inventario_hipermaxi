const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");

const CTE_EXISTENCIAS = `
  WITH existencias AS (
    SELECT
      s.id_stock AS id_registro,
      'ALMACEN'::text AS origen,
      p.id_producto,
      p.codigo AS producto_codigo,
      p.nombre AS producto,
      um.abreviatura AS unidad,
      p.stock_minimo,
      p.stock_maximo,
      p.punto_reposicion,
      a.id_almacen,
      a.codigo AS almacen_codigo,
      a.nombre AS almacen,
      NULL::text AS ubicacion,
      s.cantidad,
      COALESCE(s.cantidad_reservada, 0) AS cantidad_reservada,
      s.cantidad - COALESCE(s.cantidad_reservada, 0) AS cantidad_disponible,
      s.fecha_actualizacion
    FROM stock s
    INNER JOIN productos p ON p.id_producto = s.id_producto
    INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    INNER JOIN almacenes a ON a.id_almacen = s.id_almacen

    UNION ALL

    SELECT
      su.id_stock_ubicacion AS id_registro,
      'UBICACION'::text AS origen,
      p.id_producto,
      p.codigo AS producto_codigo,
      p.nombre AS producto,
      um.abreviatura AS unidad,
      p.stock_minimo,
      p.stock_maximo,
      p.punto_reposicion,
      a.id_almacen,
      a.codigo AS almacen_codigo,
      a.nombre AS almacen,
      NULLIF(CONCAT_WS(' / ', NULLIF(BTRIM(u.zona), ''),
        NULLIF(BTRIM(u.pasillo), ''), NULLIF(BTRIM(u.estante), ''),
        NULLIF(BTRIM(u.nivel), '')), '') AS ubicacion,
      su.cantidad,
      NULL::numeric AS cantidad_reservada,
      su.cantidad AS cantidad_disponible,
      su.fecha_actualizacion
    FROM stock_ubicaciones su
    INNER JOIN productos p ON p.id_producto = su.id_producto
    INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    INNER JOIN ubicaciones u ON u.id_ubicacion = su.id_ubicacion
    INNER JOIN almacenes a ON a.id_almacen = u.id_almacen
  )`;

const consultarStock = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const condiciones = [];
  const valores = [];

  if (req.query.search) {
    valores.push(`%${req.query.search}%`);
    const parametro = `$${valores.length}`;
    condiciones.push(
      `(producto ILIKE ${parametro} OR producto_codigo ILIKE ${parametro} OR almacen ILIKE ${parametro} OR almacen_codigo ILIKE ${parametro} OR ubicacion ILIKE ${parametro})`,
    );
  }
  if (req.query.id_almacen) {
    valores.push(req.query.id_almacen);
    condiciones.push(`id_almacen = $${valores.length}`);
  }
  if (["ALMACEN", "UBICACION"].includes(req.query.origen)) {
    valores.push(req.query.origen);
    condiciones.push(`origen = $${valores.length}`);
  }
  if (req.query.disponible === "true") {
    condiciones.push("cantidad_disponible > 0");
  } else if (req.query.disponible === "false") {
    condiciones.push("cantidad_disponible <= 0");
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `${CTE_EXISTENCIAS}
       SELECT * FROM existencias
       ${whereSql}
       ORDER BY producto ASC, almacen ASC, origen ASC, ubicacion ASC NULLS FIRST
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `${CTE_EXISTENCIAS}
       SELECT COUNT(*)::int AS total FROM existencias ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

module.exports = { consultarStock };