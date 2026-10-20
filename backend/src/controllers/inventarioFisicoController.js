const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

/**
 * POST /api/inventarios
 * Crea un inventario físico en estado PROGRAMADO.
 */
const crearInventario = asyncHandler(async (req, res) => {
  const { id_almacen, fecha_programada, alcance = "TODO" } = req.body;

  if (!id_almacen || !fecha_programada) {
    throw new ApiError(400, "Almacén y fecha programada son obligatorios");
  }

  // Evitar dos inventarios activos en el mismo almacén
  const existe = await db.query(
    `SELECT id_inventario FROM inventarios_fisicos
     WHERE id_almacen = $1 AND estado IN ('PROGRAMADO', 'EN_CONTEO')`,
    [id_almacen]
  );

  if (existe.rowCount > 0) {
    throw new ApiError(400, "Ya existe un inventario activo para este almacén");
  }

  const numero = `INV-${Date.now()}`;
  const result = await db.query(
    `INSERT INTO inventarios_fisicos
      (numero_inventario, id_almacen, id_usuario, fecha_programada, estado, observaciones)
     VALUES ($1, $2, $3, $4, 'PROGRAMADO', $5)
     RETURNING *`,
    [numero, id_almacen, req.user.id_usuario, fecha_programada, `Alcance: ${alcance}`]
  );

  res.status(201).json({ ok: true, data: result.rows[0] });
});

/**
 * GET /api/inventarios
 * Lista todos los inventarios físicos.
 */
const listarInventarios = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT i.*, a.nombre AS almacen
     FROM inventarios_fisicos i
     INNER JOIN almacenes a ON a.id_almacen = i.id_almacen
     ORDER BY i.fecha_programada DESC`
  );
  res.json({ ok: true, data: result.rows });
});

module.exports = {
  crearInventario,
  listarInventarios
};