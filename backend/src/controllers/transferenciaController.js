const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const generarNumeroTransferencia = async (client) => {
  const year = new Date().getFullYear();
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), $2)",
    ["transferencias", year],
  );
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM transferencias
     WHERE fecha_solicitud >= $1 AND fecha_solicitud < $2`,
    [`${year}-01-01`, `${year + 1}-01-01`],
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
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }
  const { almacen_origen, almacen_destino, observaciones, detalles } = req.body;
  const idAlmacenOrigen = Number(almacen_origen);
  const idAlmacenDestino = Number(almacen_destino);
  if (
    typeof almacen_origen === "boolean" ||
    !Number.isSafeInteger(idAlmacenOrigen) ||
    idAlmacenOrigen <= 0 ||
    typeof almacen_destino === "boolean" ||
    !Number.isSafeInteger(idAlmacenDestino) ||
    idAlmacenDestino <= 0
  ) {
    throw new ApiError(400, "Debe seleccionar almacenes válidos");
  }
  if (idAlmacenOrigen === idAlmacenDestino) {
    throw new ApiError(400, "Origen y destino deben ser diferentes");
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    throw new ApiError(400, "Debe incluir entre 1 y 100 productos");
  }
  const productosIncluidos = new Set();
  for (const [index, detalle] of detalles.entries()) {
    if (
      !detalle ||
      typeof detalle !== "object" ||
      typeof detalle.id_producto === "boolean" ||
      !Number.isSafeInteger(Number(detalle.id_producto)) ||
      Number(detalle.id_producto) <= 0
    ) {
      throw new ApiError(400, `El producto del detalle ${index + 1} no es válido`);
    }
    if (
      typeof detalle.cantidad === "boolean" ||
      !Number.isSafeInteger(Number(detalle.cantidad)) ||
      Number(detalle.cantidad) <= 0
    ) {
      throw new ApiError(400, `La cantidad del detalle ${index + 1} debe ser un número entero mayor a 0`);
    }
    const idProducto = Number(detalle.id_producto);
    if (productosIncluidos.has(idProducto)) {
      throw new ApiError(400, `El producto del detalle ${index + 1} está repetido`);
    }
    productosIncluidos.add(idProducto);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const almacenes = await client.query(
      `SELECT id_almacen FROM almacenes
       WHERE id_almacen = ANY($1::int[]) AND activo = TRUE
       FOR SHARE`,
      [[idAlmacenOrigen, idAlmacenDestino]],
    );
    if (almacenes.rowCount !== 2) {
      throw new ApiError(400, "Uno de los almacenes no existe o está inactivo");
    }
    const idsProductos = detalles.map((detalle) => Number(detalle.id_producto));
    const productos = await client.query(
      `SELECT id_producto FROM productos
       WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'`,
      [idsProductos],
    );
    if (productos.rowCount !== idsProductos.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }
    const numero = await generarNumeroTransferencia(client);
    const result = await client.query(
      `INSERT INTO transferencias (numero_transferencia, almacen_origen, almacen_destino, id_usuario_solicita, estado, observaciones)
       VALUES ($1, $2, $3, $4, 'SOLICITADA', $5) RETURNING *`,
      [numero, idAlmacenOrigen, idAlmacenDestino, req.user.id_usuario, observaciones || null]
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
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }
  const { id } = req.params;
  const { estado, fecha_llegada_estimada, detalles_recibidos } = req.body;
  const estadosPermitidos = ["APROBADA", "RECHAZADA", "ENVIADA", "RECIBIDA"];
  if (!estadosPermitidos.includes(estado)) {
    throw new ApiError(400, `Estado inválido. Permitidos: ${estadosPermitidos.join(", ")}`);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const transfResult = await client.query(
      `SELECT * FROM transferencias WHERE id_transferencia = $1 FOR UPDATE`,
      [id]
    );

    if (!transfResult.rowCount) throw new ApiError(404, "Transferencia no encontrada");
    const transferencia = transfResult.rows[0];

    if (estado === "APROBADA" || estado === "RECHAZADA") {
      if (transferencia.estado !== "SOLICITADA") {
        throw new ApiError(400, "Solo se puede decidir una transferencia solicitada");
      }
      if (!["ENCARGADO_ALMACEN", "ADMINISTRADOR"].includes(req.user.rol)) {
        throw new ApiError(403, "Solo un encargado o administrador puede aprobar o rechazar");
      }
      const columnaFecha =
        estado === "APROBADA" ? "fecha_aprobacion" : "fecha_rechazo";
      await client.query(
        `UPDATE transferencias
         SET estado = $1,
             id_usuario_aprueba = CASE WHEN $1 = 'APROBADA' THEN $2 ELSE id_usuario_aprueba END,
             ${columnaFecha} = CURRENT_TIMESTAMP
         WHERE id_transferencia = $3`,
        [estado, req.user.id_usuario, id],
      );
    } else if (estado === "ENVIADA") {
      if (transferencia.estado !== "APROBADA") {
        throw new ApiError(400, "Solo se pueden enviar transferencias en estado APROBADA");
      }
      if (
        typeof fecha_llegada_estimada !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha_llegada_estimada) ||
        Number.isNaN(new Date(`${fecha_llegada_estimada}T00:00:00.000Z`).getTime()) ||
        new Date(`${fecha_llegada_estimada}T00:00:00.000Z`).toISOString().slice(0, 10) !== fecha_llegada_estimada
      ) {
        throw new ApiError(400, "Debe indicar una fecha estimada de llegada válida");
      }

      const detalles = await client.query(
        `SELECT id_detalle_transferencia, id_producto, cantidad_solicitada
         FROM detalle_transferencias WHERE id_transferencia = $1`,
        [id]
      );

      for (const d of detalles.rows) {
        const stockRes = await client.query(
          `SELECT id_stock, cantidad, cantidad_reservada
           FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
          [d.id_producto, transferencia.almacen_origen]
        );
        const disponible = stockRes.rowCount
          ? Number(stockRes.rows[0].cantidad) -
            Number(stockRes.rows[0].cantidad_reservada || 0)
          : 0;
        if (!stockRes.rowCount || disponible < Number(d.cantidad_solicitada)) {
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
        await client.query(
          `UPDATE detalle_transferencias
           SET cantidad_enviada = cantidad_solicitada
           WHERE id_detalle_transferencia = $1`,
          [d.id_detalle_transferencia],
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

      const detalles = await client.query(
        `SELECT id_detalle_transferencia, id_producto, cantidad_solicitada,
                cantidad_enviada
         FROM detalle_transferencias WHERE id_transferencia = $1`,
        [id]
      );
      if (!Array.isArray(detalles_recibidos) || detalles_recibidos.length !== detalles.rowCount) {
        throw new ApiError(400, "Debe informar la cantidad recibida para cada producto");
      }

      const cantidadesRecibidas = new Map();
      for (const [index, detalle] of detalles_recibidos.entries()) {
        const idDetalle = Number(detalle?.id_detalle_transferencia);
        const cantidadRecibida = Number(detalle?.cantidad_recibida);
        if (
          typeof detalle?.id_detalle_transferencia === "boolean" ||
          typeof detalle?.cantidad_recibida === "boolean" ||
          !Number.isSafeInteger(idDetalle) ||
          !Number.isSafeInteger(cantidadRecibida) ||
          cantidadRecibida < 0 ||
          cantidadesRecibidas.has(idDetalle)
        ) {
          throw new ApiError(400, `La cantidad recibida de la línea ${index + 1} no es válida`);
        }
        cantidadesRecibidas.set(idDetalle, cantidadRecibida);
      }

      for (const d of detalles.rows) {
        const cantidadRecibida = cantidadesRecibidas.get(
          d.id_detalle_transferencia,
        );
        if (cantidadRecibida === undefined) {
          throw new ApiError(400, "Falta la cantidad recibida para un producto");
        }
        if (cantidadRecibida > Number(d.cantidad_enviada)) {
          throw new ApiError(
            400,
            `No se puede recibir más de lo enviado para el producto ${d.id_producto}`,
          );
        }

        if (cantidadRecibida > 0) {
          const stockRes = await client.query(
            `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
             VALUES ($1, $2, $3, 0)
             ON CONFLICT (id_producto, id_almacen)
             DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad, fecha_actualizacion = CURRENT_TIMESTAMP
             RETURNING cantidad, cantidad - $3::numeric AS stock_anterior`,
            [d.id_producto, transferencia.almacen_destino, cantidadRecibida]
          );

          await client.query(
            `INSERT INTO movimientos_inventario
              (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia)
             VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7)`,
            [
              d.id_producto,
              transferencia.almacen_destino,
              req.user.id_usuario,
              cantidadRecibida,
              stockRes.rows[0].stock_anterior,
              stockRes.rows[0].cantidad,
              transferencia.numero_transferencia,
            ]
          );
        }

        await client.query(
          `UPDATE detalle_transferencias
           SET cantidad_recibida = $1
           WHERE id_detalle_transferencia = $2`,
          [cantidadRecibida, d.id_detalle_transferencia],
        );
      }

      await client.query(
        `UPDATE transferencias SET estado = 'RECIBIDA', fecha_recepcion = CURRENT_TIMESTAMP WHERE id_transferencia = $1`,
        [id]
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