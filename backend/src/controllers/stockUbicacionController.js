const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

async function validarProducto(id_producto) {
  const r = await db.query(
    "SELECT id_producto FROM productos WHERE id_producto = $1",
    [id_producto],
  );
  if (!r.rowCount) throw new ApiError(400, "El producto no existe");
}

async function validarUbicacion(id_ubicacion) {
  const r = await db.query(
    "SELECT id_ubicacion FROM ubicaciones WHERE id_ubicacion = $1 AND activo = TRUE",
    [id_ubicacion],
  );
  if (!r.rowCount) {
    throw new ApiError(400, "La ubicación no existe o está inactiva");
  }
}

/**
 * POST /api/stock-ubicaciones
 * Asigna un producto a una ubicación (o suma cantidad si ya existe).
 */
const asignarProducto = asyncHandler(async (req, res) => {
  const { id_producto, id_ubicacion, cantidad } = req.body;

  await validarProducto(id_producto);
  await validarUbicacion(id_ubicacion);

  // Upsert: si ya existe la combinación, sumar; si no, insertar
  const result = await db.query(
    `INSERT INTO stock_ubicaciones (id_producto, id_ubicacion, cantidad)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_producto, id_ubicacion)
     DO UPDATE SET
       cantidad = stock_ubicaciones.cantidad + EXCLUDED.cantidad,
       fecha_actualizacion = CURRENT_TIMESTAMP
     RETURNING *`,
    [id_producto, id_ubicacion, cantidad],
  );

  res.status(201).json({
    ok: true,
    message: "Producto asignado a la ubicación",
    data: result.rows[0],
  });
});

/**
 * PUT /api/stock-ubicaciones/:id
 * Actualiza la cantidad exacta (no suma).
 */
const actualizarCantidad = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cantidad } = req.body;

  if (cantidad === undefined || Number(cantidad) < 0) {
    throw new ApiError(400, "La cantidad debe ser mayor o igual a 0");
  }

  const result = await db.query(
    `UPDATE stock_ubicaciones
     SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id_stock_ubicacion = $2
     RETURNING *`,
    [cantidad, id],
  );

  if (!result.rowCount) {
    throw new ApiError(404, "Registro de stock no encontrado");
  }

  res.json({
    ok: true,
    message: "Cantidad actualizada",
    data: result.rows[0],
  });
});

/**
 * DELETE /api/stock-ubicaciones/:id
 * Quita el producto de la ubicación.
 */
const quitarProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `DELETE FROM stock_ubicaciones
     WHERE id_stock_ubicacion = $1
     RETURNING id_stock_ubicacion`,
    [id],
  );

  if (!result.rowCount) {
    throw new ApiError(404, "Registro de stock no encontrado");
  }

  res.json({
    ok: true,
    message: "Producto quitado de la ubicación",
    data: result.rows[0],
  });
});

module.exports = {
  asignarProducto,
  actualizarCantidad,
  quitarProducto,
};