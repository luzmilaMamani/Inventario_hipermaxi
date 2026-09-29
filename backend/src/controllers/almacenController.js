const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

/**
 * Valida que el código no exista (o no exista en otro registro).
 */
async function validarCodigoUnico(codigo, idExcluir = null) {
  const sql = idExcluir
    ? "SELECT id_almacen FROM almacenes WHERE codigo = $1 AND id_almacen <> $2"
    : "SELECT id_almacen FROM almacenes WHERE codigo = $1";
  const params = idExcluir ? [codigo, idExcluir] : [codigo];

  const result = await db.query(sql, params);
  if (result.rowCount) {
    throw new ApiError(409, "Ya existe un almacén con ese código");
  }
}

/**
 * GET /api/almacenes
 * Filtros: search, tipo, ciudad, activo, orderBy, order, page, limit
 */
const listarAlmacenes = asyncHandler(async (req, res) => {
  const { search, tipo, ciudad, activo } = req.query;

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const allowedOrderBy = [
    "id_almacen",
    "codigo",
    "nombre",
    "tipo",
    "ciudad",
    "fecha_creacion",
  ];
  const orderBy = allowedOrderBy.includes(req.query.orderBy)
    ? req.query.orderBy
    : "fecha_creacion";
  const order =
    String(req.query.order || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (search) {
    condiciones.push(
      `(nombre ILIKE $${i} OR codigo ILIKE $${i} OR ciudad ILIKE $${i})`,
    );
    valores.push(`%${search}%`);
    i++;
  }
  if (tipo) {
    condiciones.push(`tipo = $${i++}`);
    valores.push(tipo);
  }
  if (ciudad) {
    condiciones.push(`ciudad ILIKE $${i++}`);
    valores.push(`%${ciudad}%`);
  }
  if (activo !== undefined && activo !== "") {
    condiciones.push(`activo = $${i++}`);
    valores.push(activo === "true");
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         id_almacen, codigo, nombre, tipo, direccion, ciudad,
         capacidad, activo, fecha_creacion
       FROM almacenes
       ${whereSql}
       ORDER BY ${orderBy} ${order}
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM almacenes ${whereSql}`,
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
 * GET /api/almacenes/:id
 */
const obtenerAlmacen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT id_almacen, codigo, nombre, tipo, direccion, ciudad,
            capacidad, activo, fecha_creacion
     FROM almacenes
     WHERE id_almacen = $1`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Almacén no encontrado");

  res.json({ ok: true, data: result.rows[0] });
});

/**
 * GET /api/almacenes/:id/stock
 * Devuelve el stock actual del almacén con datos del producto.
 */
const obtenerStockAlmacen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existe = await db.query(
    "SELECT id_almacen FROM almacenes WHERE id_almacen = $1",
    [id],
  );
  if (!existe.rowCount) throw new ApiError(404, "Almacén no encontrado");

  const result = await db.query(
    `SELECT
       s.id_stock,
       s.cantidad,
       s.cantidad_reservada,
       (s.cantidad - s.cantidad_reservada) AS cantidad_disponible,
       s.fecha_actualizacion,
       p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
       p.stock_minimo, p.punto_reposicion,
       c.nombre AS categoria,
       m.nombre AS marca,
       u.abreviatura AS unidad
     FROM stock s
     INNER JOIN productos p ON p.id_producto = s.id_producto
     INNER JOIN categorias c ON c.id_categoria = p.id_categoria
     LEFT JOIN marcas m ON m.id_marca = p.id_marca
     INNER JOIN unidades_medida u ON u.id_unidad = p.id_unidad
     WHERE s.id_almacen = $1
     ORDER BY p.nombre ASC`,
    [id],
  );

  res.json({ ok: true, data: result.rows });
});

/**
 * POST /api/almacenes
 */
const crearAlmacen = asyncHandler(async (req, res) => {
  const {
    codigo,
    nombre,
    tipo = "SUCURSAL",
    direccion,
    ciudad,
    capacidad,
    activo = true,
  } = req.body;

  await validarCodigoUnico(codigo);

  const result = await db.query(
    `INSERT INTO almacenes
      (codigo, nombre, tipo, direccion, ciudad, capacidad, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_almacen, codigo, nombre, tipo, direccion, ciudad,
               capacidad, activo, fecha_creacion`,
    [
      codigo,
      nombre,
      tipo,
      direccion || null,
      ciudad || null,
      capacidad || null,
      activo,
    ],
  );

  res.status(201).json({
    ok: true,
    message: "Almacén registrado exitosamente",
    data: result.rows[0],
  });
});

/**
 * PUT /api/almacenes/:id
 */
const actualizarAlmacen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existe = await db.query(
    "SELECT * FROM almacenes WHERE id_almacen = $1",
    [id],
  );
  if (!existe.rowCount) throw new ApiError(404, "Almacén no encontrado");

  const actual = existe.rows[0];
  const {
    codigo,
    nombre,
    tipo,
    direccion,
    ciudad,
    capacidad,
    activo,
  } = req.body;

  if (codigo !== undefined && codigo !== actual.codigo) {
    await validarCodigoUnico(codigo, id);
  }

  const result = await db.query(
    `UPDATE almacenes SET
      codigo = COALESCE($1, codigo),
      nombre = COALESCE($2, nombre),
      tipo = COALESCE($3, tipo),
      direccion = COALESCE($4, direccion),
      ciudad = COALESCE($5, ciudad),
      capacidad = COALESCE($6, capacidad),
      activo = COALESCE($7, activo)
     WHERE id_almacen = $8
     RETURNING id_almacen, codigo, nombre, tipo, direccion, ciudad,
               capacidad, activo, fecha_creacion`,
    [
      codigo ?? null,
      nombre ?? null,
      tipo ?? null,
      direccion ?? null,
      ciudad ?? null,
      capacidad ?? null,
      activo ?? null,
      id,
    ],
  );

  res.json({
    ok: true,
    message: "Almacén actualizado correctamente",
    data: result.rows[0],
  });
});

/**
 * DELETE /api/almacenes/:id (borrado lógico)
 */
const eliminarAlmacen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `UPDATE almacenes SET activo = FALSE
     WHERE id_almacen = $1
     RETURNING id_almacen, codigo, nombre, activo`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Almacén no encontrado");

  res.json({
    ok: true,
    message: "Almacén desactivado",
    data: result.rows[0],
  });
});

module.exports = {
  listarAlmacenes,
  obtenerAlmacen,
  obtenerStockAlmacen,
  crearAlmacen,
  actualizarAlmacen,
  eliminarAlmacen,
};