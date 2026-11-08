const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { CONDICION_LOTE_VENCIDO } = require("../services/lotesVencidos");

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  return (
    !Number.isNaN(fechaParseada.getTime()) &&
    fechaParseada.toISOString().slice(0, 10) === fecha
  );
}

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
      -- RF43: lo vencido se muestra aparte y no cuenta como disponible.
      vd.cantidad_vencida,
      GREATEST(s.cantidad - COALESCE(s.cantidad_reservada, 0) - vd.cantidad_vencida, 0)
        AS cantidad_disponible,
      s.fecha_actualizacion
    FROM stock s
    CROSS JOIN LATERAL (
      SELECT fn_cantidad_vencida(s.id_producto, s.id_almacen) AS cantidad_vencida
    ) vd
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
      NULL::numeric AS cantidad_vencida,
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

const consultarHistorialProducto = asyncHandler(async (req, res) => {
  const idProducto = Number(req.params.id_producto);
  if (!Number.isSafeInteger(idProducto) || idProducto <= 0) {
    throw new ApiError(400, "El ID del producto no es válido");
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const condiciones = ["m.id_producto = $1"];
  const valores = [idProducto];

  if (req.query.id_almacen !== undefined && req.query.id_almacen !== "") {
    const idAlmacen = Number(req.query.id_almacen);
    if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
      throw new ApiError(400, "El almacén no es válido");
    }
    valores.push(idAlmacen);
    condiciones.push(`m.id_almacen = $${valores.length}`);
  }

  for (const [parametro, operador] of [
    ["fecha_desde", ">="],
    ["fecha_hasta", "<"],
  ]) {
    const fecha = req.query[parametro];
    if (!fecha) continue;
    if (!esFechaValida(fecha)) {
      throw new ApiError(400, `La fecha ${parametro} no es válida`);
    }
    valores.push(fecha);
    const expresion =
      operador === "<" ? `$${valores.length}::date + INTERVAL '1 day'` : `$${valores.length}::date`;
    condiciones.push(`m.fecha_movimiento ${operador} ${expresion}`);
  }

  if (
    req.query.fecha_desde &&
    req.query.fecha_hasta &&
    req.query.fecha_desde > req.query.fecha_hasta
  ) {
    throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  }

  const whereSql = condiciones.join(" AND ");
  const limitParameter = valores.length + 1;
  const offsetParameter = valores.length + 2;

  const productoResult = await db.query(
    `SELECT p.id_producto, p.codigo, p.nombre, um.abreviatura AS unidad
     FROM productos p
     INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     WHERE p.id_producto = $1`,
    [idProducto],
  );

  if (!productoResult.rowCount) {
    throw new ApiError(404, "Producto no encontrado");
  }

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         m.id_movimiento,
         m.fecha_movimiento,
         m.tipo_movimiento,
         m.cantidad,
         m.stock_anterior,
         m.stock_nuevo,
         m.referencia,
         m.observaciones,
         a.nombre AS almacen,
         u.nombre_completo AS usuario
       FROM movimientos_inventario m
       INNER JOIN almacenes a ON a.id_almacen = m.id_almacen
       LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
       WHERE ${whereSql}
       ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM movimientos_inventario m
       WHERE ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    producto: productoResult.rows[0],
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const consultarProximosVencer = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  // RF50: con dias=parametro cada lote usa los días de anticipación de su
  // categoría (o el valor general si la categoría no tiene uno propio).
  const usarParametro = req.query.dias === "parametro";
  const dias = usarParametro
    ? null
    : req.query.dias === undefined || req.query.dias === ""
      ? 30
      : Number(req.query.dias);
  if (!usarParametro && (!Number.isSafeInteger(dias) || dias < 0 || dias > 365)) {
    throw new ApiError(400, "Los días restantes deben ser un entero entre 0 y 365");
  }

  const valores = [];
  const condiciones = [
    "lp.fecha_vencimiento IS NOT NULL",
    "lp.cantidad_actual > 0",
    "lp.fecha_vencimiento >= CURRENT_DATE",
  ];
  if (usarParametro) {
    condiciones.push(
      "lp.fecha_vencimiento <= CURRENT_DATE + COALESCE(pvc.dias_anticipacion, pvg.dias_anticipacion, 30)",
    );
  } else {
    valores.push(dias);
    condiciones.push(`lp.fecha_vencimiento <= CURRENT_DATE + $${valores.length}::int`);
  }

  for (const [parametro, columna, mensaje] of [
    ["id_almacen", "lp.id_almacen", "El almacén no es válido"],
    ["id_categoria", "p.id_categoria", "La categoría no es válida"],
  ]) {
    const valor = req.query[parametro];
    if (valor === undefined || valor === "") continue;
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ApiError(400, mensaje);
    }
    valores.push(id);
    condiciones.push(`${columna} = $${valores.length}`);
  }

  const fromSql = `
    FROM lotes_productos lp
    INNER JOIN productos p ON p.id_producto = lp.id_producto
    INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
    LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    LEFT JOIN parametros_vencimiento_categoria pvc ON pvc.id_categoria = p.id_categoria
    LEFT JOIN parametro_vencimiento_general pvg ON pvg.id_parametro = 1
    WHERE ${condiciones.join(" AND ")}`;

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         lp.id_lote,
         lp.numero_lote,
         TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         (lp.fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
         lp.cantidad_actual AS cantidad,
         lp.estado,
         p.id_producto,
         p.codigo AS producto_codigo,
         p.nombre AS producto,
         um.abreviatura AS unidad,
         c.id_categoria,
         c.nombre AS categoria,
         COALESCE(pvc.dias_anticipacion, pvg.dias_anticipacion, 30) AS dias_anticipacion,
         a.id_almacen,
         a.codigo AS almacen_codigo,
         a.nombre AS almacen
       ${fromSql}
       ORDER BY lp.fecha_vencimiento ASC, p.nombre ASC, lp.id_lote ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total ${fromSql}`, valores),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    filtros: { dias: usarParametro ? "parametro" : dias },
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

// RF43: vista separada de lotes vencidos con existencia, pendientes de baja
// por salida de VENCIMIENTO (RF27).
const consultarLotesVencidos = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const valores = [];
  const condiciones = [CONDICION_LOTE_VENCIDO];

  for (const [parametro, columna, mensaje] of [
    ["id_almacen", "lp.id_almacen", "El almacén no es válido"],
    ["id_categoria", "p.id_categoria", "La categoría no es válida"],
  ]) {
    const valor = req.query[parametro];
    if (valor === undefined || valor === "") continue;
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ApiError(400, mensaje);
    }
    valores.push(id);
    condiciones.push(`${columna} = $${valores.length}`);
  }
  if (req.query.search) {
    valores.push(`%${String(req.query.search).trim()}%`);
    const parametro = `$${valores.length}`;
    condiciones.push(
      `(p.nombre ILIKE ${parametro} OR p.codigo ILIKE ${parametro} OR lp.numero_lote ILIKE ${parametro})`,
    );
  }

  const fromSql = `
    FROM lotes_productos lp
    INNER JOIN productos p ON p.id_producto = lp.id_producto
    INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
    LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    WHERE ${condiciones.join(" AND ")}`;

  const [dataResult, resumenResult] = await Promise.all([
    db.query(
      `SELECT
         lp.id_lote,
         lp.numero_lote,
         TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         (CURRENT_DATE - lp.fecha_vencimiento)::int AS dias_vencido,
         lp.cantidad_actual AS cantidad,
         'VENCIDO' AS estado,
         COALESCE(p.precio, 0) AS precio,
         lp.cantidad_actual * COALESCE(p.precio, 0) AS valor,
         p.id_producto,
         p.codigo AS producto_codigo,
         p.nombre AS producto,
         um.abreviatura AS unidad,
         c.id_categoria,
         c.nombre AS categoria,
         a.id_almacen,
         a.codigo AS almacen_codigo,
         a.nombre AS almacen
       ${fromSql}
       ORDER BY lp.fecha_vencimiento ASC, p.nombre ASC, lp.id_lote ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(lp.cantidad_actual), 0)::numeric AS total_unidades,
         COALESCE(SUM(lp.cantidad_actual * COALESCE(p.precio, 0)), 0)::numeric AS total_valor
       ${fromSql}`,
      valores,
    ),
  ]);

  const { total, total_unidades, total_valor } = resumenResult.rows[0];
  res.json({
    ok: true,
    data: dataResult.rows,
    resumen: {
      total_lotes: total,
      total_unidades: Number(total_unidades),
      total_valor: Number(total_valor),
    },
    pagination: { page, limit, total },
  });
});

module.exports = {
  consultarStock,
  consultarHistorialProducto,
  consultarProximosVencer,
  consultarLotesVencidos,
};