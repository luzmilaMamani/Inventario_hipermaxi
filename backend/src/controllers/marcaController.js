const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const listarMarcas = asyncHandler(async (req, res) => {
  const { nombre, activo, search, orderBy = "nombre", order = "ASC" } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const allowedOrder = ["id_marca", "nombre"];
  const orderField = allowedOrder.includes(orderBy) ? orderBy : "nombre";
  const orderDir = String(order).toUpperCase() === "DESC" ? "DESC" : "ASC";

  const condiciones = [];
  const valores = [];
  let i = 1;

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
      `SELECT id_marca, nombre, descripcion, activo
       FROM marcas
       ${whereSql}
       ORDER BY ${orderField} ${orderDir}
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM marcas ${whereSql}`,
      valores
    ),
  ]);

  res.json({
    ok: true,
    data: data.rows,
    pagination: { page, limit, total: count.rows[0].total },
  });
});

const obtenerMarca = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT id_marca, nombre, descripcion, activo
     FROM marcas WHERE id_marca = $1`,
    [id]
  );
  if (!result.rowCount) throw new ApiError(404, "Marca no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

const crearMarca = asyncHandler(async (req, res) => {
  const { nombre, descripcion, activo = true } = req.body;
  if (!nombre || !String(nombre).trim()) {
    throw new ApiError(400, "El nombre es obligatorio");
  }
  const result = await db.query(
    `INSERT INTO marcas (nombre, descripcion, activo)
     VALUES ($1, $2, $3) RETURNING *`,
    [nombre.trim(), descripcion || null, activo]
  );
  res.status(201).json({ ok: true, data: result.rows[0] });
});

const actualizarMarca = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, activo } = req.body;

  const result = await db.query(
    `UPDATE marcas SET
       nombre = COALESCE($1, nombre),
       descripcion = COALESCE($2, descripcion),
       activo = COALESCE($3, activo)
     WHERE id_marca = $4 RETURNING *`,
    [nombre ?? null, descripcion ?? null, activo ?? null, id]
  );

  if (!result.rowCount) throw new ApiError(404, "Marca no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

const eliminarMarca = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `UPDATE marcas SET activo = FALSE
     WHERE id_marca = $1
     RETURNING id_marca, nombre, activo`,
    [id]
  );
  if (!result.rowCount) throw new ApiError(404, "Marca no encontrada");
  res.json({ ok: true, data: result.rows[0] });
});

module.exports = {
  listarMarcas,
  obtenerMarca,
  crearMarca,
  actualizarMarca,
  eliminarMarca,
};