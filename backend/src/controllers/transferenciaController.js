const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const generarNumeroTransferencia = async () => {
  const year = new Date().getFullYear();
  const result = await db.query(
    "SELECT COUNT(*)::int AS total FROM transferencias WHERE fecha_solicitud >= $1",
    [`${year}-01-01`]
  );
  return `TRF-${year}-${String(result.rows[0].total + 1).padStart(4, "0")}`;
};

const listarTransferencias = asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (estado) {
    condiciones.push(`vt.estado = $${i++}`);
    valores.push(estado);
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const result = await db.query(
    `SELECT
       vt.*,
       tr.fecha_llegada_estimada,
       tr.fecha_envio AS fecha_envio_trazabilidad,
       tr.fecha_recepcion AS fecha_recepcion_trazabilidad
     FROM vw_transferencias vt
     INNER JOIN transferencias tr ON tr.id_transferencia = vt.id_transferencia
     ${whereSql}
     ORDER BY vt.fecha_solicitud DESC`,
    valores
  );
  res.json({ ok: true, data: result.rows });
});

const obtenerTransferencia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT vt.*, tr.fecha_llegada_estimada, tr.observaciones
     FROM vw_transferencias vt
     INNER JOIN transferencias tr ON tr.id_transferencia = vt.id_transferencia
     WHERE vt.id_transferencia = $1`,
    [id]
  );

  if (!result.rowCount) throw new ApiError(404, "Transferencia no encontrada");

  const detalles = await db.query(
    `SELECT dt.*, p.nombre AS producto, p.codigo
     FROM detalle_transferencias dt
     INNER JOIN productos p ON p.id_producto = dt.id_producto
     WHERE dt.id_transferencia = $1`,
    [id]
  );

  res.json({ ok: true, data: { ...result.rows[0], detalles: detalles.rows } });
});

const crearTransferencia = asyncHandler(async (req, res) => {
  const { almacen_origen, almacen_destino, observaciones, detalles } = req.body;
  if (almacen_origen === almacen_destino) throw new ApiError(400, "Origen y destino deben ser diferentes");
  if (!detalles || detalles.length === 0) throw new ApiError(400, "Debe incluir productos");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const numero = await generarNumeroTransferencia();
    const result = await client.query(
      `INSERT INTO transferencias (numero_transferencia, almacen_origen, almacen_destino, id_usuario_solicita, estado, observaciones)
       VALUES ($1, $2, $3, $4, 'SOLICITADA', $5) RETURNING *`,
      [numero, almacen_origen, almacen_destino, req.user.id_usuario, observaciones || null]
    );

    const transferencia = result.rows[0];

    for (const d of detalles) {
      await client.query(
        `INSERT INTO detalle_transferencias (id_transferencia, id_producto, cantidad_solicitada)
         VALUES ($1, $2, $3)`,
        [transferencia.id_transferencia, d.id_producto, d.cantidad]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, data: transferencia });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * RF31 y RF32: Cambiar estado
 */
const cambiarEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado, fecha_llegada_estimada, detalles_recibidos } = req.body;

  if (!estado) throw new ApiError(400, "El estado es obligatorio");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const transfResult = await client.query(
      `SELECT * FROM transferencias WHERE id_transferencia = $1 FOR UPDATE`,
      [id]
    );

    if (!transfResult.rowCount) throw new ApiError(404, "Transferencia no encontrada");
    const transferencia = transfResult.rows[0];

    // Validaciones de flujo
    if (estado === "ENVIADA") {
      if (transferencia.estado !== "APROBADA") {
        throw new ApiError(400, "Solo se pueden enviar transferencias en estado APROBADA");
      }
      if (!fecha_llegada_estimada) {
        throw new ApiError(400, "Debe indicar la fecha estimada de llegada");
      }

      // Descontar stock del origen
      const detalles = await client.query(
        "SELECT id_producto, cantidad_solicitada FROM detalle_transferencias WHERE id_transferencia = $1",
        [id]
      );

      for (const d of detalles.rows) {
        const stockRes = await client.query(
          `SELECT id_stock, cantidad FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
          [d.id_producto, transferencia.almacen_origen]
        );

        if (!stockRes.rowCount || Number(stockRes.rows[0].cantidad) < Number(d.cantidad_solicitada)) {
          throw new ApiError(400, `Stock insuficiente en el origen para el producto ${d.id_producto}`);
        }

        const nuevoStock = Number(stockRes.rows[0].cantidad) - Number(d.cantidad_solicitada);
        await client.query(
          `UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_stock = $2`,
          [nuevoStock, stockRes.rows[0].id_stock]
        );

        // Registrar movimiento
        await client.query(
          `INSERT INTO movimientos_inventario
            (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia)
           VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7)`,
          [
            d.id_producto,
            transferencia.almacen_origen,
            req.user.id_usuario,
            d.cantidad_solicitada,
            stockRes.rows[0].cantidad,
            nuevoStock,
            transferencia.numero_transferencia,
          ]
        );
      }

      await client.query(
        `UPDATE transferencias SET estado = 'ENVIADA', fecha_envio = CURRENT_TIMESTAMP, fecha_llegada_estimada = $1 WHERE id_transferencia = $2`,
        [fecha_llegada_estimada, id]
      );

    } else if (estado === "RECIBIDA") {
      if (transferencia.estado !== "ENVIADA") {
        throw new ApiError(400, "Solo se pueden recibir transferencias en estado ENVIADA");
      }

      // Sumar stock al destino
      const detalles = await client.query(
        "SELECT id_producto, cantidad_solicitada FROM detalle_transferencias WHERE id_transferencia = $1",
        [id]
      );

      for (const d of detalles.rows) {
        const stockRes = await client.query(
          `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (id_producto, id_almacen)
           DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad, fecha_actualizacion = CURRENT_TIMESTAMP
           RETURNING cantidad, cantidad - $3::numeric AS stock_anterior`,
          [d.id_producto, transferencia.almacen_destino, d.cantidad_solicitada]
        );

        await client.query(
          `INSERT INTO movimientos_inventario
            (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia)
           VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7)`,
          [
            d.id_producto,
            transferencia.almacen_destino,
            req.user.id_usuario,
            d.cantidad_solicitada,
            stockRes.rows[0].stock_anterior,
            stockRes.rows[0].cantidad,
            transferencia.numero_transferencia,
          ]
        );
      }

      await client.query(
        `UPDATE transferencias SET estado = 'RECIBIDA', fecha_recepcion = CURRENT_TIMESTAMP WHERE id_transferencia = $1`,
        [id]
      );
    } else {
      // Otros estados (APROBADA, RECHAZADA, CANCELADA)
      await client.query(
        `UPDATE transferencias SET estado = $1 WHERE id_transferencia = $2`,
        [estado, id]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, message: `Transferencia actualizada a ${estado}` });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = { listarTransferencias, obtenerTransferencia, crearTransferencia, cambiarEstado };