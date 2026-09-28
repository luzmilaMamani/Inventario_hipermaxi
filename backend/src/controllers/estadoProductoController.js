const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO", "DESCONTINUADO"];

/**
 * Cambia el estado de un producto.
 * PUT /api/productos/:id/estado
 * Body: { estado: 'ACTIVO' | 'INACTIVO' | 'DESCONTINUADO', motivo?: string }
 */
const cambiarEstadoProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado, motivo } = req.body;

  if (!estado) {
    throw new ApiError(400, "El campo 'estado' es obligatorio");
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new ApiError(
      400,
      `Estado inválido. Permitidos: ${ESTADOS_VALIDOS.join(", ")}`
    );
  }

  const existe = await db.query(
    "SELECT id_producto, codigo, nombre, estado FROM productos WHERE id_producto = $1",
    [id]
  );

  if (!existe.rowCount) {
    throw new ApiError(404, "Producto no encontrado");
  }

  const producto = existe.rows[0];

  if (producto.estado === estado) {
    throw new ApiError(
      400,
      `El producto ya se encuentra en estado ${estado}`
    );
  }

  const result = await db.query(
    `UPDATE productos
     SET estado = $1
     WHERE id_producto = $2
     RETURNING id_producto, codigo, nombre, estado, fecha_creacion`,
    [estado, id]
  );

  res.json({
    ok: true,
    message: `Estado del producto actualizado a ${estado}`,
    data: {
      ...result.rows[0],
      estado_anterior: producto.estado,
      motivo: motivo || null,
    },
  });
});

/**
 * Obtiene el estado actual de un producto.
 * GET /api/productos/:id/estado
 */
const obtenerEstadoProducto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT id_producto, codigo, nombre, estado, fecha_creacion
     FROM productos
     WHERE id_producto = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new ApiError(404, "Producto no encontrado");
  }

  res.json({ ok: true, data: result.rows[0] });
});

module.exports = {
  cambiarEstadoProducto,
  obtenerEstadoProducto,
  ESTADOS_VALIDOS,
};