const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const crearInventario = asyncHandler(async (req, res) => {
  const { id_almacen, fecha_programada, alcance = "TODO" } = req.body;
  if (!id_almacen || !fecha_programada) throw new ApiError(400, "Almacén y fecha son obligatorios");

  const existe = await db.query(
    `SELECT id_inventario FROM inventarios_fisicos WHERE id_almacen = $1 AND estado IN ('PROGRAMADO', 'EN_CONTEO')`,
    [id_almacen]
  );
  if (existe.rowCount > 0) throw new ApiError(400, "Ya existe un inventario activo para este almacén");

  const numero = `INV-${Date.now()}`;
  const result = await db.query(
    `INSERT INTO inventarios_fisicos (numero_inventario, id_almacen, id_usuario, fecha_programada, estado, observaciones)
     VALUES ($1, $2, $3, $4, 'PROGRAMADO', $5) RETURNING *`,
    [numero, id_almacen, req.user.id_usuario, fecha_programada, `Alcance: ${alcance}`]
  );
  res.status(201).json({ ok: true, data: result.rows[0] });
});

const listarInventarios = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT i.*, a.nombre AS almacen FROM inventarios_fisicos i
     INNER JOIN almacenes a ON a.id_almacen = i.id_almacen ORDER BY i.fecha_programada DESC`
  );
  res.json({ ok: true, data: result.rows });
});

const registrarConteo = asyncHandler(async (req, res) => {
  const { id_inventario } = req.params;
  const { id_producto, cantidad_fisica, id_lote } = req.body;

  if (cantidad_fisica === undefined || Number(cantidad_fisica) < 0) {
    throw new ApiError(400, "La cantidad física debe ser mayor o igual a 0");
  }

  const inv = await db.query("SELECT estado, id_almacen FROM inventarios_fisicos WHERE id_inventario = $1", [id_inventario]);
  if (!inv.rowCount) throw new ApiError(404, "Inventario no encontrado");
  if (!['PROGRAMADO', 'EN_CONTEO'].includes(inv.rows[0].estado)) throw new ApiError(400, "Inventario no abierto");

  if (inv.rows[0].estado === 'PROGRAMADO') {
    await db.query(`UPDATE inventarios_fisicos SET estado = 'EN_CONTEO' WHERE id_inventario = $1`, [id_inventario]);
  }

  const stock = await db.query(`SELECT cantidad FROM stock WHERE id_producto = $1 AND id_almacen = $2`, [id_producto, inv.rows[0].id_almacen]);
  const cantidadSistema = stock.rowCount ? Number(stock.rows[0].cantidad) : 0;

  const result = await db.query(
    `INSERT INTO detalle_inventario_fisico (id_inventario, id_producto, id_lote, cantidad_sistema, cantidad_fisica)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id_inventario, id_producto, id_lote || null, cantidadSistema, cantidad_fisica]
  );
  res.status(201).json({ ok: true, data: result.rows[0] });
});

const obtenerComparativa = asyncHandler(async (req, res) => {
  const { id_inventario } = req.params;
  const result = await db.query(
    `SELECT d.*, p.nombre AS producto, p.codigo 
     FROM detalle_inventario_fisico d
     INNER JOIN productos p ON p.id_producto = d.id_producto 
     WHERE d.id_inventario = $1`,
    [id_inventario]
  );
  res.json({ ok: true, data: result.rows });
});

/**
 * GET /api/inventarios/:id_inventario/diferencias
 * Devuelve solo los productos con diferencia != 0, clasificados.
 */
const obtenerDiferencias = asyncHandler(async (req, res) => {
  const { id_inventario } = req.params;
  const result = await db.query(
    `SELECT d.*, p.nombre AS producto, p.codigo,
            CASE 
              WHEN d.diferencia > 0 THEN 'SOBRANTE' 
              WHEN d.diferencia < 0 THEN 'FALTANTE' 
              ELSE 'CONFORME' 
            END AS tipo_diferencia
     FROM detalle_inventario_fisico d
     INNER JOIN productos p ON p.id_producto = d.id_producto
     WHERE d.id_inventario = $1 AND d.diferencia != 0
     ORDER BY ABS(d.diferencia) DESC`,
    [id_inventario]
  );
  res.json({ ok: true, data: result.rows });
});

module.exports = {
  crearInventario,
  listarInventarios,
  registrarConteo,
  obtenerComparativa,
  obtenerDiferencias // <-- NUEVA
};