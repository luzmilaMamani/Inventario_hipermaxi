const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const listarSubcategorias = asyncHandler(async (req, res) => {
  const { id_categoria, nombre, activo, search, orderBy = "nombre", order = "ASC" } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const allowedOrder = ["id_subcategoria", "nombre"];
  const orderField = allowedOrder.includes(orderBy) ? orderBy : "nombre";
  const orderDir = String(order).toUpperCase() === "DESC" ? "DESC" : "ASC";

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (id_categoria) {
    condiciones.push(`id_categoria = $${i++}`);
    valores.push(id_categoria);
  }
  const busqueda = search || nombre;
  if (busqueda) {
    condiciones.push(`nombre ILIKE $${i++}`);
    valores.push(`%${busqueda}%`);
  }
  if (activo !== undefined && activo !== "") {
    condiciones.push(`activo = $${i++}`);
    valores.push(activo === "true");
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [data, count] = await Promise.all([
    db.query(
      `SELECT id_subcategoria, id_categoria, nombre, descripcion, activo
       FROM subcategorias
       ${whereSql}
       ORDER BY ${orderField} ${orderDir}
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM subcategorias ${whereSql}`,
      valores
    ),
  ]);

  res.json({
    ok: true,
    data: data.rows,
    pagination: { page, limit, total: count.rows[0].total },
  });
});

const obtenerSubcategoria = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT id_subcategoria, id_categoria, nombre, descripcion, activo
     FROM subcategorias WHERE id_subcategoria = $1`,
    [id]
  );
  if (!result.rowCount) throw new ApiError(404, "Subcategoría no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

const crearSubcategoria = asyncHandler(async (req, res) => {
  const { id_categoria, nombre, descripcion, activo = true } = req.body;
  if (!id_categoria) throw new ApiError(400, "La categoría es obligatoria");
  if (!nombre || !String(nombre).trim()) {
    throw new ApiError(400, "El nombre es obligatorio");
  }
  const result = await db.query(
    `INSERT INTO subcategorias (id_categoria, nombre, descripcion, activo)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id_categoria, nombre.trim(), descripcion || null, activo]
  );
  res.status(201).json({ ok: true, data: result.rows[0] });
});

const actualizarSubcategoria = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id_categoria, nombre, descripcion, activo } = req.body;

  const result = await db.query(
    `UPDATE subcategorias SET
       id_categoria = COALESCE($1, id_categoria),
       nombre = COALESCE($2, nombre),
       descripcion = COALESCE($3, descripcion),
       activo = COALESCE($4, activo)
     WHERE id_subcategoria = $5 RETURNING *`,
    [id_categoria ?? null, nombre ?? null, descripcion ?? null, activo ?? null, id]
  );

  if (!result.rowCount) throw new ApiError(404, "Subcategoría no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

const eliminarSubcategoria = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `UPDATE subcategorias SET activo = FALSE
     WHERE id_subcategoria = $1
     RETURNING id_subcategoria, nombre, activo`,
    [id]
  );
  if (!result.rowCount) throw new ApiError(404, "Subcategoría no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

module.exports = {
  listarSubcategorias,
  obtenerSubcategoria,
  crearSubcategoria,
  actualizarSubcategoria,
  eliminarSubcategoria,
};