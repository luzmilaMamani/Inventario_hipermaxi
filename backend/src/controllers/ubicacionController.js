const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

async function validarAlmacen(id_almacen) {
  const result = await db.query(
    "SELECT id_almacen FROM almacenes WHERE id_almacen = $1",
    [id_almacen],
  );
  if (!result.rowCount) {
    throw new ApiError(400, "El almacén no existe");
  }
}

/**
 * GET /api/ubicaciones
 * Filtros: id_almacen, zona, pasillo, activo, search, page, limit
 */
const listarUbicaciones = asyncHandler(async (req, res) => {
  const { id_almacen, zona, pasillo, activo, search } = req.query;

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (id_almacen) {
    condiciones.push(`u.id_almacen = $${i++}`);
    valores.push(id_almacen);
  }
  if (zona) {
    condiciones.push(`u.zona ILIKE $${i++}`);
    valores.push(`%${zona}%`);
  }
  if (pasillo) {
    condiciones.push(`u.pasillo ILIKE $${i++}`);
    valores.push(`%${pasillo}%`);
  }
  if (activo !== undefined && activo !== "") {
    condiciones.push(`u.activo = $${i++}`);
    valores.push(activo === "true");
  }
  if (search) {
    condiciones.push(
      `(u.zona ILIKE $${i} OR u.pasillo ILIKE $${i} OR u.estante ILIKE $${i} OR u.descripcion ILIKE $${i})`,
    );
    valores.push(`%${search}%`);
    i++;
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         u.id_ubicacion, u.id_almacen, u.zona, u.pasillo, u.estante,
         u.nivel, u.descripcion, u.activo,
         a.codigo AS almacen_codigo, a.nombre AS almacen,
         (SELECT COALESCE(SUM(cantidad), 0) FROM stock_ubicaciones su WHERE su.id_ubicacion = u.id_ubicacion) AS total_productos
       FROM ubicaciones u
       INNER JOIN almacenes a ON a.id_almacen = u.id_almacen
       ${whereSql}
       ORDER BY a.nombre ASC, u.zona ASC, u.pasillo ASC, u.estante ASC
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM ubicaciones u ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

/**
 * GET /api/ubicaciones/:id
 */
const obtenerUbicacion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT
       u.id_ubicacion, u.id_almacen, u.zona, u.pasillo, u.estante,
       u.nivel, u.descripcion, u.activo,
       a.codigo AS almacen_codigo, a.nombre AS almacen
     FROM ubicaciones u
     INNER JOIN almacenes a ON a.id_almacen = u.id_almacen
     WHERE u.id_ubicacion = $1`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Ubicación no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

/**
 * GET /api/ubicaciones/:id/stock
 * Productos en esa ubicación.
 */
const obtenerStockUbicacion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existe = await db.query(
    "SELECT id_ubicacion FROM ubicaciones WHERE id_ubicacion = $1",
    [id],
  );
  if (!existe.rowCount) throw new ApiError(404, "Ubicación no encontrada");

  const result = await db.query(
    `SELECT
       su.id_stock_ubicacion,
       su.cantidad,
       su.fecha_actualizacion,
       p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
       c.nombre AS categoria,
       m.nombre AS marca,
       u.abreviatura AS unidad
     FROM stock_ubicaciones su
     INNER JOIN productos p ON p.id_producto = su.id_producto
     INNER JOIN categorias c ON c.id_categoria = p.id_categoria
     LEFT JOIN marcas m ON m.id_marca = p.id_marca
     INNER JOIN unidades_medida u ON u.id_unidad = p.id_unidad
     WHERE su.id_ubicacion = $1
     ORDER BY p.nombre ASC`,
    [id],
  );

  res.json({ ok: true, data: result.rows });
});

/**
 * POST /api/ubicaciones
 */
const crearUbicacion = asyncHandler(async (req, res) => {
  const { id_almacen, zona, pasillo, estante, nivel, descripcion, activo = true } =
    req.body;

  await validarAlmacen(id_almacen);

  const result = await db.query(
    `INSERT INTO ubicaciones
      (id_almacen, zona, pasillo, estante, nivel, descripcion, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id_almacen,
      zona || null,
      pasillo || null,
      estante || null,
      nivel || null,
      descripcion || null,
      activo,
    ],
  );

  res.status(201).json({
    ok: true,
    message: "Ubicación registrada exitosamente",
    data: result.rows[0],
  });
});

/**
 * PUT /api/ubicaciones/:id
 */
const actualizarUbicacion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existe = await db.query(
    "SELECT * FROM ubicaciones WHERE id_ubicacion = $1",
    [id],
  );
  if (!existe.rowCount) throw new ApiError(404, "Ubicación no encontrada");

  const { id_almacen, zona, pasillo, estante, nivel, descripcion, activo } =
    req.body;

  if (id_almacen !== undefined) {
    await validarAlmacen(id_almacen);
  }

  const result = await db.query(
    `UPDATE ubicaciones SET
      id_almacen = COALESCE($1, id_almacen),
      zona = COALESCE($2, zona),
      pasillo = COALESCE($3, pasillo),
      estante = COALESCE($4, estante),
      nivel = COALESCE($5, nivel),
      descripcion = COALESCE($6, descripcion),
      activo = COALESCE($7, activo)
     WHERE id_ubicacion = $8
     RETURNING *`,
    [
      id_almacen ?? null,
      zona ?? null,
      pasillo ?? null,
      estante ?? null,
      nivel ?? null,
      descripcion ?? null,
      activo ?? null,
      id,
    ],
  );

  res.json({
    ok: true,
    message: "Ubicación actualizada correctamente",
    data: result.rows[0],
  });
});

/**
 * DELETE /api/ubicaciones/:id (borrado lógico)
 */
const eliminarUbicacion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const stock = await db.query(
    "SELECT COUNT(*)::int AS total FROM stock_ubicaciones WHERE id_ubicacion = $1 AND cantidad > 0",
    [id],
  );

  if (stock.rows[0].total > 0) {
    throw new ApiError(
      400,
      "No se puede desactivar: la ubicación tiene productos asignados",
    );
  }

  const result = await db.query(
    `UPDATE ubicaciones SET activo = FALSE
     WHERE id_ubicacion = $1
     RETURNING id_ubicacion, zona, pasillo, estante, activo`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Ubicación no encontrada");

  res.json({
    ok: true,
    message: "Ubicación desactivada",
    data: result.rows[0],
  });
});

module.exports = {
  listarUbicaciones,
  obtenerUbicacion,
  obtenerStockUbicacion,
  crearUbicacion,
  actualizarUbicacion,
  eliminarUbicacion,
};