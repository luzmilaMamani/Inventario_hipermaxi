const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

/**
 * POST /api/ventas/descontar
 * Procesa una venta del sistema externo, descuenta el stock y registra el movimiento.
 */
const registrarVenta = asyncHandler(async (req, res) => {
  const { id_almacen, referencia_externa, detalles } = req.body;

  if (!id_almacen || !referencia_externa || !Array.isArray(detalles) || detalles.length === 0) {
    throw new ApiError(400, "Almacén, referencia externa y detalles son obligatorios");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const numero_salida = `VEN-${Date.now()}`;
    const salidaResult = await client.query(
      `INSERT INTO salidas_inventario
        (numero_salida, id_almacen, id_usuario, motivo, referencia_externa, estado)
       VALUES ($1, $2, $3, 'VENTA', $4, 'CONFIRMADA')
       RETURNING *`,
      [numero_salida, id_almacen, req.user.id_usuario, referencia_externa]
    );
    const salida = salidaResult.rows[0];

    for (const d of detalles) {
      const cantidad = Number(d.cantidad);
      const id_producto = Number(d.id_producto);

      const stockResult = await client.query(
        `SELECT id_stock, cantidad, cantidad_reservada FROM stock
         WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
        [id_producto, id_almacen]
      );

      if (!stockResult.rowCount) {
        throw new ApiError(400, `No hay stock registrado para el producto ${id_producto}`);
      }

      const stockActual = stockResult.rows[0];
      const disponible = Number(stockActual.cantidad) - Number(stockActual.cantidad_reservada || 0);

      if (cantidad > disponible) {
        throw new ApiError(400, `Stock insuficiente para el producto ${id_producto}. Disponible: ${disponible}`);
      }

      await client.query(
        `INSERT INTO detalle_salidas (id_salida, id_producto, cantidad)
         VALUES ($1, $2, $3)`,
        [salida.id_salida, id_producto, cantidad]
      );

      const nuevoStock = Number(stockActual.cantidad) - cantidad;
      await client.query(
        `UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [nuevoStock, stockActual.id_stock]
      );

      await client.query(
        `INSERT INTO movimientos_inventario
          (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia)
         VALUES ($1, $2, $3, 'VENTA', $4, $5, $6, $7)`,
        [id_producto, id_almacen, req.user.id_usuario, cantidad, stockActual.cantidad, nuevoStock, referencia_externa]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: "Venta registrada y stock actualizado",
      data: { id_salida: salida.id_salida, numero_salida: salida.numero_salida }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = { registrarVenta };