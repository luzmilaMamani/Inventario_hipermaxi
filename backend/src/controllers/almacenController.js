const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

/**
 * Valida que el código no exista (o no exista en otro registro).
 */
function textoContacto(valor, actual = null) {
  if (valor === undefined) return actual ?? null;
  const limpio = String(valor).trim();
  return limpio || null;
}

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
  if (ciudad && String(ciudad).trim()) {
    condiciones.push(`BTRIM(ciudad) ILIKE $${i++}`);
    valores.push(String(ciudad).trim());
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
         telefono, responsable,
        capacidad,
        (SELECT COALESCE(SUM(s.cantidad), 0)
         FROM stock s
         WHERE s.id_almacen = almacenes.id_almacen) AS ocupacion,
        superficie_m2,
        superficie_m2 * 0.6 AS area_almacenamiento_m2,
        ROUND(superficie_m2 * 10500 / 7280)::int AS capacidad_pallets_min,
        ROUND(superficie_m2 * 11500 / 7280)::int AS capacidad_pallets_max,
        CASE
          WHEN ocupacion.productos_sin_conversion > 0 THEN NULL
          ELSE ocupacion.pallets_ocupados
        END AS pallets_ocupados,
        ocupacion.productos_sin_conversion,
        activo, fecha_creacion
       FROM almacenes
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(CEIL(s.cantidad / NULLIF(p.unidades_por_pale, 0)))
             FILTER (WHERE s.cantidad > 0 AND p.unidades_por_pale IS NOT NULL), 0)::int AS pallets_ocupados,
           COUNT(*) FILTER (WHERE s.cantidad > 0 AND p.unidades_por_pale IS NULL)::int AS productos_sin_conversion
         FROM stock s
         INNER JOIN productos p ON p.id_producto = s.id_producto
         WHERE s.id_almacen = almacenes.id_almacen
       ) ocupacion ON TRUE
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
 * GET /api/almacenes/ciudades
 * Ciudades distintas ya registradas, para el filtro de la lista.
 */
const listarCiudades = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT DISTINCT BTRIM(ciudad) AS ciudad
     FROM almacenes
     WHERE ciudad IS NOT NULL AND BTRIM(ciudad) <> ''
     ORDER BY ciudad ASC`,
  );

  res.json({
    ok: true,
    data: result.rows.map((row) => row.ciudad),
  });
});

/**
 * GET /api/almacenes/:id
 */
const obtenerAlmacen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT id_almacen, codigo, nombre, tipo, direccion, ciudad,
            superficie_m2, telefono, responsable, activo, fecha_creacion
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
       fn_cantidad_vencida(s.id_producto, s.id_almacen) AS cantidad_vencida,
       GREATEST(s.cantidad - s.cantidad_reservada - fn_cantidad_no_disponible(s.id_producto, s.id_almacen), 0) AS cantidad_disponible,
       s.fecha_actualizacion,
       p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
       p.stock_minimo, p.stock_maximo, p.punto_reposicion,
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
    superficie_m2 = 7280,
    telefono,
    responsable,
    activo = true,
  } = req.body;

  await validarCodigoUnico(codigo);

  const result = await db.query(
    `INSERT INTO almacenes
      (codigo, nombre, tipo, direccion, ciudad, superficie_m2, telefono, responsable, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id_almacen, codigo, nombre, tipo, direccion, ciudad,
               superficie_m2, telefono, responsable, activo, fecha_creacion`,
    [
      codigo,
      nombre,
      tipo,
      direccion || null,
      ciudad || null,
      superficie_m2,
      textoContacto(telefono),
      textoContacto(responsable),
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
    superficie_m2,
    telefono,
    responsable,
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
      superficie_m2 = COALESCE($6, superficie_m2),
      activo = COALESCE($7, activo),
      telefono = $8,
      responsable = $9
     WHERE id_almacen = $10
     RETURNING id_almacen, codigo, nombre, tipo, direccion, ciudad,
               superficie_m2, telefono, responsable, activo, fecha_creacion`,
    [
      codigo ?? null,
      nombre ?? null,
      tipo ?? null,
      direccion ?? null,
      ciudad ?? null,
      superficie_m2 ?? null,
      activo ?? null,
      textoContacto(telefono, actual.telefono),
      textoContacto(responsable, actual.responsable),
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
  listarCiudades,
  obtenerAlmacen,
  obtenerStockAlmacen,
  crearAlmacen,
  actualizarAlmacen,
  eliminarAlmacen,
};