const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { asignarLotes } = require("../services/lotesFefo");
const { obtenerCantidadNoDisponible } = require("../services/lotesVencidos");

/**
 * POST /api/ventas/descontar
 * Procesa una venta del sistema externo, descuenta el stock y registra el movimiento.
 */
const registrarVenta = asyncHandler(async (req, res) => {
  const { id_almacen, referencia_externa, detalles } = req.body;

  if (!id_almacen || !referencia_externa || !Array.isArray(detalles) || detalles.length === 0) {
    throw new ApiError(400, "Almacén, referencia externa y detalles son obligatorios");
  }
  for (const [index, detalle] of detalles.entries()) {
    if (
      !detalle ||
      typeof detalle !== "object" ||
      !Number.isSafeInteger(Number(detalle.id_producto)) ||
      Number(detalle.id_producto) <= 0
    ) {
      throw new ApiError(400, `El producto del detalle ${index + 1} no es válido`);
    }
    if (
      !Number.isSafeInteger(Number(detalle.cantidad)) ||
      Number(detalle.cantidad) <= 0
    ) {
      throw new ApiError(400, `La cantidad del detalle ${index + 1} debe ser un número entero mayor a 0`);
    }
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

      // RF49: la venta descuenta de los lotes vigentes que vencen antes (FEFO).
      const asignaciones = await asignarLotes(client, { id_producto, id_almacen, cantidad });

      const stockResult = await client.query(
        `SELECT id_stock, cantidad, cantidad_reservada FROM stock
         WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
        [id_producto, id_almacen]
      );

      if (!stockResult.rowCount) {
        throw new ApiError(400, `No hay stock registrado para el producto ${id_producto}`);
      }

      const stockActual = stockResult.rows[0];
      // RF43/RF61: las unidades vencidas o en cuarentena no se pueden vender.
      const disponible =
        Number(stockActual.cantidad) -
        Number(stockActual.cantidad_reservada || 0) -
        (await obtenerCantidadNoDisponible(client, id_producto, id_almacen));

      if (cantidad > disponible) {
        throw new ApiError(400, `Stock insuficiente para el producto ${id_producto}. Disponible: ${disponible}`);
      }

      const precioResult = await client.query(
        "SELECT COALESCE(precio, 0) AS precio FROM productos WHERE id_producto = $1",
        [id_producto]
      );
      const precio = Number(precioResult.rows[0]?.precio || 0);


      let stockCorriente = Number(stockActual.cantidad);
      for (const { lote, cantidad: cantidadLote, id_lote_sugerido } of asignaciones) {
        await client.query(
          `INSERT INTO detalle_salidas
            (id_salida, id_producto, id_lote, cantidad, precio_unitario, valor_total, id_lote_sugerido)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [salida.id_salida, id_producto, lote.id_lote, cantidadLote, precio, precio * cantidadLote, id_lote_sugerido]
        );

        const loteNuevo = Number(lote.cantidad_actual) - cantidadLote;
        await client.query(
          `UPDATE lotes_productos
           SET cantidad_actual = $1,
               estado = CASE WHEN $1::numeric = 0::numeric THEN 'AGOTADO' ELSE estado END
           WHERE id_lote = $2`,
          [loteNuevo, lote.id_lote]
        );

        const stockNuevo = stockCorriente - cantidadLote;
        await client.query(
          `INSERT INTO movimientos_inventario
            (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia)
           VALUES ($1, $2, $3, $4, 'VENTA', $5, $6, $7, $8)`,
          [id_producto, id_almacen, lote.id_lote, req.user.id_usuario, cantidadLote, stockCorriente, stockNuevo, referencia_externa]
        );
        stockCorriente = stockNuevo;
      }

      await client.query(
        `UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [stockCorriente, stockActual.id_stock]
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