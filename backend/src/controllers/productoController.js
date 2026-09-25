const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

async function validarSubcategoria(id_categoria, id_subcategoria) {
  if (!id_subcategoria) return;

  const result = await db.query(
    "SELECT id_categoria FROM subcategorias WHERE id_subcategoria = $1",
    [id_subcategoria],
  );

  if (!result.rowCount) {
    throw new ApiError(400, "La subcategoría no existe");
  }
  if (Number(result.rows[0].id_categoria) !== Number(id_categoria)) {
    throw new ApiError(
      400,
      "La subcategoría no pertenece a la categoría seleccionada",
    );
  }
}

async function validarCodigoBarrasUnico(codigo_barras, idExcluir = null) {
  if (!codigo_barras) return;

  const sql = idExcluir
    ? "SELECT id_producto FROM productos WHERE codigo_barras = $1 AND id_producto <> $2"
    : "SELECT id_producto FROM productos WHERE codigo_barras = $1";
  const params = idExcluir ? [codigo_barras, idExcluir] : [codigo_barras];

  const result = await db.query(sql, params);
  if (result.rowCount) {
    throw new ApiError(409, "El código de barras ya está registrado");
  }
}

const crearProducto = asyncHandler(async (req, res) => {
  const {
    codigo,
    codigo_barras,
    nombre,
    descripcion,
    id_categoria,
    id_subcategoria,
    id_marca,
    id_unidad,
    controla_vencimiento = false,
    stock_minimo = 0,
    stock_maximo = 0,
    punto_reposicion = 0,
  } = req.body;

  //  Validar coherencia categoría/subcategoría
  await validarSubcategoria(id_categoria, id_subcategoria);

  // Validar código de barras único
  await validarCodigoBarrasUnico(codigo_barras);

  const result = await db.query(
    `INSERT INTO productos
      (codigo, codigo_barras, nombre, descripcion, id_categoria, id_subcategoria,
       id_marca, id_unidad, controla_vencimiento, stock_minimo, stock_maximo,
       punto_reposicion, estado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVO')
     RETURNING *`,
    [
      codigo,
      codigo_barras || null,
      nombre,
      descripcion || null,
      id_categoria,
      id_subcategoria || null,
      id_marca || null,
      id_unidad,
      controla_vencimiento,
      stock_minimo,
      stock_maximo,
      punto_reposicion,
    ],
  );

  res.status(201).json({
    ok: true,
    message: "Producto registrado exitosamente",
    data: result.rows[0],
  });
});

const actualizarProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existe = await db.query(
    "SELECT * FROM productos WHERE id_producto = $1",
    [id],
  );
  if (!existe.rowCount) throw new ApiError(404, "Producto no encontrado");

  const actual = existe.rows[0];
  const {
    codigo,
    codigo_barras,
    nombre,
    descripcion,
    id_categoria,
    id_subcategoria,
    id_marca,
    id_unidad,
    controla_vencimiento,
    stock_minimo,
    stock_maximo,
    punto_reposicion,
    estado,
  } = req.body;

  // Validar coherencia si cambia categoría/subcategoría
  const catFinal = id_categoria ?? actual.id_categoria;
  const subFinal = id_subcategoria ?? actual.id_subcategoria;
  if (id_categoria !== undefined || id_subcategoria !== undefined) {
    await validarSubcategoria(catFinal, subFinal);
  }

  // Código de barras único
  if (codigo_barras !== undefined && codigo_barras !== actual.codigo_barras) {
    await validarCodigoBarrasUnico(codigo_barras, id);
  }

  // Validación stock máximo vs mínimo
  const smMin = stock_minimo ?? actual.stock_minimo;
  const smMax = stock_maximo ?? actual.stock_maximo;
  if (Number(smMax) < Number(smMin)) {
    throw new ApiError(400, "El stock máximo debe ser >= stock mínimo");
  }

  const result = await db.query(
    `UPDATE productos SET
      codigo = COALESCE($1, codigo),
      codigo_barras = COALESCE($2, codigo_barras),
      nombre = COALESCE($3, nombre),
      descripcion = COALESCE($4, descripcion),
      id_categoria = COALESCE($5, id_categoria),
      id_subcategoria = COALESCE($6, id_subcategoria),
      id_marca = COALESCE($7, id_marca),
      id_unidad = COALESCE($8, id_unidad),
      controla_vencimiento = COALESCE($9, controla_vencimiento),
      stock_minimo = COALESCE($10, stock_minimo),
      stock_maximo = COALESCE($11, stock_maximo),
      punto_reposicion = COALESCE($12, punto_reposicion),
      estado = COALESCE($13, estado)
     WHERE id_producto = $14
     RETURNING *`,
    [
      codigo ?? null,
      codigo_barras ?? null,
      nombre ?? null,
      descripcion ?? null,
      id_categoria ?? null,
      id_subcategoria ?? null,
      id_marca ?? null,
      id_unidad ?? null,
      controla_vencimiento ?? null,
      stock_minimo ?? null,
      stock_maximo ?? null,
      punto_reposicion ?? null,
      estado ?? null,
      id,
    ],
  );

  res.json({
    ok: true,
    message: "Producto actualizado correctamente",
    data: result.rows[0],
  });
});

const listarProductos = asyncHandler(async (req, res) => {
  const { search, id_categoria, id_marca, estado } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (search) {
    condiciones.push(
      `(p.nombre ILIKE $${i} OR p.codigo ILIKE $${i} OR p.codigo_barras ILIKE $${i})`,
    );
    valores.push(`%${search}%`);
    i++;
  }
  if (id_categoria) {
    condiciones.push(`p.id_categoria = $${i++}`);
    valores.push(id_categoria);
  }
  if (id_marca) {
    condiciones.push(`p.id_marca = $${i++}`);
    valores.push(id_marca);
  }
  if (estado) {
    condiciones.push(`p.estado = $${i++}`);
    valores.push(estado);
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         p.id_producto, p.codigo, p.codigo_barras, p.nombre, p.descripcion,
         p.estado, p.controla_vencimiento, p.stock_minimo, p.stock_maximo,
         p.punto_reposicion, p.fecha_creacion,
         c.id_categoria, c.nombre AS categoria,
         s.id_subcategoria, s.nombre AS subcategoria,
         m.id_marca, m.nombre AS marca,
         u.id_unidad, u.nombre AS unidad, u.abreviatura
       FROM productos p
       INNER JOIN categorias c ON p.id_categoria = c.id_categoria
       LEFT JOIN subcategorias s ON p.id_subcategoria = s.id_subcategoria
       LEFT JOIN marcas m ON p.id_marca = m.id_marca
       INNER JOIN unidades_medida u ON p.id_unidad = u.id_unidad
       ${whereSql}
       ORDER BY p.fecha_creacion DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM productos p ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const obtenerProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT
       p.*, c.nombre AS categoria, s.nombre AS subcategoria,
       m.nombre AS marca, u.nombre AS unidad, u.abreviatura
     FROM productos p
     INNER JOIN categorias c ON p.id_categoria = c.id_categoria
     LEFT JOIN subcategorias s ON p.id_subcategoria = s.id_subcategoria
     LEFT JOIN marcas m ON p.id_marca = m.id_marca
     INNER JOIN unidades_medida u ON p.id_unidad = u.id_unidad
     WHERE p.id_producto = $1`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Producto no encontrado");
  res.json({ ok: true, data: result.rows[0] });
});

const buscarPorCodigoBarras = asyncHandler(async (req, res) => {
  const { codigo } = req.params;

  const result = await db.query(
    `SELECT
       p.id_producto, p.codigo, p.codigo_barras, p.nombre,
       p.estado, p.controla_vencimiento,
       c.nombre AS categoria, m.nombre AS marca,
       u.abreviatura AS unidad
     FROM productos p
     INNER JOIN categorias c ON p.id_categoria = c.id_categoria
     LEFT JOIN marcas m ON p.id_marca = m.id_marca
     INNER JOIN unidades_medida u ON p.id_unidad = u.id_unidad
     WHERE p.codigo_barras = $1`,
    [codigo],
  );

  if (!result.rowCount) {
    throw new ApiError(404, "No se encontró producto con ese código de barras");
  }

  res.json({ ok: true, data: result.rows[0] });
});

const eliminarProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `UPDATE productos SET estado = 'INACTIVO'
     WHERE id_producto = $1
     RETURNING id_producto, codigo, estado`,
    [id],
  );

  if (!result.rowCount) throw new ApiError(404, "Producto no encontrado");
  res.json({ ok: true, message: "Producto desactivado", data: result.rows[0] });
});

module.exports = {
  crearProducto,
  actualizarProducto,
  listarProductos,
  obtenerProducto,
  buscarPorCodigoDeBarras: buscarPorCodigoBarras,
  buscarPorCodigoBarras,
  eliminarProducto,
};
