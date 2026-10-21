const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

async function generarNumeroTransferencia(client) {
  const year = new Date().getFullYear();
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [year]);
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM transferencias
     WHERE EXTRACT(YEAR FROM fecha_solicitud)::integer = $1::integer`,
    [year],
  );
  const siguiente = result.rows[0].total + 1;
  return `TRF-${year}-${String(siguiente).padStart(4, "0")}`;
}

const crearTransferencia = asyncHandler(async (req, res) => {
  const {
    almacen_origen,
    almacen_destino,
    observaciones,
    detalles = [],
  } = req.body;
  const id_usuario_solicita = req.user.id_usuario;
  const idOrigen = Number(almacen_origen);
  const idDestino = Number(almacen_destino);

  if (
    !Number.isSafeInteger(idOrigen) ||
    idOrigen <= 0 ||
    !Number.isSafeInteger(idDestino) ||
    idDestino <= 0
  ) {
    throw new ApiError(400, "Debe seleccionar almacenes válidos");
  }
  if (idOrigen === idDestino) {
    throw new ApiError(
      400,
      "El almacén de origen y destino no pueden ser el mismo",
    );
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    throw new ApiError(400, "Debe incluir al menos un producto");
  }

  const lineas = detalles.map((detalle, indice) => {
    const id_producto = Number(detalle?.id_producto);
    const cantidad = Number(detalle?.cantidad);
    if (!Number.isSafeInteger(id_producto) || id_producto <= 0) {
      throw new ApiError(400, `El producto de la línea ${indice + 1} no es válido`);
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ApiError(400, `La cantidad de la línea ${indice + 1} debe ser mayor a cero`);
    }
    return { id_producto, cantidad };
  });
  if (new Set(lineas.map((linea) => linea.id_producto)).size !== lineas.length) {
    throw new ApiError(400, "No se puede repetir un producto en la transferencia");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const almacenes = await client.query(
      `SELECT id_almacen
       FROM almacenes
       WHERE id_almacen = ANY($1::integer[]) AND activo = TRUE`,
      [[idOrigen, idDestino]],
    );
    if (almacenes.rowCount !== 2) {
      throw new ApiError(400, "El almacén de origen o destino no existe o está inactivo");
    }

    const idsProductos = lineas.map((linea) => linea.id_producto);
    const productos = await client.query(
      `SELECT id_producto
       FROM productos
       WHERE id_producto = ANY($1::integer[]) AND estado = 'ACTIVO'`,
      [idsProductos],
    );
    if (productos.rowCount !== lineas.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    const numero_transferencia = await generarNumeroTransferencia(client);

    // 1. Crear cabecera
    const trfResult = await client.query(
      `INSERT INTO transferencias 
        (numero_transferencia, almacen_origen, almacen_destino, id_usuario_solicita, estado, observaciones)
       VALUES ($1, $2, $3, $4, 'SOLICITADA', $5) RETURNING *`,
      [
        numero_transferencia,
        idOrigen,
        idDestino,
        id_usuario_solicita,
        observaciones,
      ],
    );
    const transferencia = trfResult.rows[0];

    // 2. Validar y reservar stock en origen
    for (const { id_producto, cantidad } of lineas) {
      const stockResult = await client.query(
        `SELECT cantidad, cantidad_reservada
         FROM stock
         WHERE id_producto = $1 AND id_almacen = $2
         FOR UPDATE`,
        [id_producto, idOrigen],
      );

      if (!stockResult.rowCount) {
        throw new ApiError(
          400,
          `El producto ${id_producto} no existe en el origen`,
        );
      }

      const stock = stockResult.rows[0];
      const disponible =
        Number(stock.cantidad) - Number(stock.cantidad_reservada);

      if (cantidad > disponible) {
        throw new ApiError(
          400,
          `Stock insuficiente en origen para el producto ${id_producto}. Disponible: ${disponible}`,
        );
      }

      // Insertar detalle
      await client.query(
        `INSERT INTO detalle_transferencias 
          (id_transferencia, id_producto, cantidad_solicitada, cantidad_enviada, cantidad_recibida)
         VALUES ($1, $2, $3, 0, 0)`,
        [transferencia.id_transferencia, id_producto, cantidad],
      );

      // Reservar stock
      await client.query(
        `UPDATE stock SET cantidad_reservada = cantidad_reservada + $1 
         WHERE id_producto = $2 AND id_almacen = $3`,
        [cantidad, id_producto, idOrigen],
      );
    }

    // 3. Notificar al responsable del origen
    const jefeResult = await client.query(
      `SELECT u.id_usuario FROM usuarios u
       INNER JOIN roles r ON r.id_rol = u.id_rol
       WHERE r.nombre IN ('ENCARGADO_ALMACEN', 'ADMINISTRADOR') AND u.activo = TRUE LIMIT 1`,
    );

    if (jefeResult.rowCount) {
      await client.query(
        `INSERT INTO notificaciones (id_usuario, titulo, mensaje)
         VALUES ($1, 'Nueva Solicitud de Transferencia', $2)`,
        [
          jefeResult.rows[0].id_usuario,
          `Se ha creado la solicitud ${numero_transferencia}.`,
        ],
      );
    }

    await client.query("COMMIT");
    res
      .status(201)
      .json({
        ok: true,
        message: "Transferencia solicitada",
        data: transferencia,
      });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listarTransferencias = asyncHandler(async (req, res) => {
  const { estado, id_almacen } = req.query;
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (estado) {
    condiciones.push(`vt.estado = $${i++}`);
    valores.push(estado);
  }
  if (id_almacen) {
    const idAlmacen = Number(id_almacen);
    if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
      throw new ApiError(400, "El almacén indicado no es válido");
    }
    condiciones.push(
      `EXISTS (
         SELECT 1
         FROM transferencias tr
         WHERE tr.id_transferencia = vt.id_transferencia
           AND (tr.almacen_origen = $${i}::integer
             OR tr.almacen_destino = $${i}::integer)
       )`,
    );
    valores.push(idAlmacen);
    i++;
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";
  const result = await db.query(
    `SELECT vt.*
     FROM vw_transferencias vt
     ${whereSql}
     ORDER BY vt.fecha_solicitud DESC`,
    valores,
  );
  res.json({ ok: true, data: result.rows });
});

const obtenerTransferencia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cabecera = await db.query(
    `SELECT * FROM vw_transferencias WHERE id_transferencia = $1`,
    [id],
  );
  if (!cabecera.rowCount)
    throw new ApiError(404, "Transferencia no encontrada");

  const detalles = await db.query(
    `SELECT dt.*, p.codigo AS producto_codigo, p.nombre AS producto, um.abreviatura AS unidad
     FROM detalle_transferencias dt
     INNER JOIN productos p ON p.id_producto = dt.id_producto
     INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     WHERE dt.id_transferencia = $1`,
    [id],
  );

  res.json({
    ok: true,
    data: { ...cabecera.rows[0], detalles: detalles.rows },
  });
});

const cambiarEstado = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { estado } = req.body;
  const id_usuario = req.user.id_usuario;
  const transiciones = {
    SOLICITADA: ["APROBADA", "RECHAZADA", "CANCELADA"],
    APROBADA: ["ENVIADA", "CANCELADA"],
    ENVIADA: ["RECIBIDA"],
  };

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(400, "La transferencia indicada no es válida");
  }
  if (!["APROBADA", "RECHAZADA", "ENVIADA", "RECIBIDA", "CANCELADA"].includes(estado)) {
    throw new ApiError(400, "El estado de transferencia no es válido");
  }
  if (
    ["APROBADA", "RECHAZADA"].includes(estado) &&
    !["ENCARGADO_ALMACEN", "ADMINISTRADOR"].includes(req.user.rol)
  ) {
    throw new ApiError(
      403,
      "Solo un encargado de almacén o administrador puede aprobar o rechazar transferencias",
    );
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const trfResult = await client.query(
      `SELECT * FROM transferencias WHERE id_transferencia = $1 FOR UPDATE`,
      [id],
    );
    if (!trfResult.rowCount)
      throw new ApiError(404, "Transferencia no encontrada");
    const trf = trfResult.rows[0];

    if (!(transiciones[trf.estado] || []).includes(estado)) {
      throw new ApiError(
        400,
        `No se puede cambiar una transferencia de ${trf.estado} a ${estado}`,
      );
    }

    const updateFields = ["estado = $1"];
    const valores = [estado];

    if (estado === "APROBADA") {
      updateFields.push(
        `id_usuario_aprueba = $2`,
        `fecha_aprobacion = CURRENT_TIMESTAMP`,
      );
      valores.push(id_usuario);
    } else if (estado === "ENVIADA") {
      updateFields.push(`fecha_envio = CURRENT_TIMESTAMP`);
    } else if (estado === "RECIBIDA") {
      updateFields.push(`fecha_recepcion = CURRENT_TIMESTAMP`);
    }

    await client.query(
      `UPDATE transferencias SET ${updateFields.join(", ")} WHERE id_transferencia = $${valores.length + 1}`,
      [...valores, id],
    );

    const detalles = await client.query(
      `SELECT *
       FROM detalle_transferencias
       WHERE id_transferencia = $1
       ORDER BY id_detalle_transferencia
       FOR UPDATE`,
      [id],
    );

    if (estado === "RECHAZADA" || estado === "CANCELADA") {
      // Liberar la reserva únicamente antes de que el stock salga del origen.
      for (const d of detalles.rows) {
        const stock = await client.query(
          `UPDATE stock
           SET cantidad_reservada = cantidad_reservada - $1
           WHERE id_producto = $2
             AND id_almacen = $3
             AND cantidad_reservada >= $1`,
          [d.cantidad_solicitada, d.id_producto, trf.almacen_origen],
        );
        if (!stock.rowCount) {
          throw new ApiError(409, "La reserva de stock ya no coincide con la transferencia");
        }
      }
    } else if (estado === "ENVIADA") {
      // Usar parámetros distintos: cantidad y cantidad_reservada pueden tener
      // tipos SQL diferentes.
      for (const d of detalles.rows) {
        const stockAnterior = await client.query(
          `SELECT cantidad, cantidad_reservada
           FROM stock
           WHERE id_producto = $1 AND id_almacen = $2
           FOR UPDATE`,
          [d.id_producto, trf.almacen_origen],
        );
        if (
          !stockAnterior.rowCount ||
          Number(stockAnterior.rows[0].cantidad) < Number(d.cantidad_solicitada) ||
          Number(stockAnterior.rows[0].cantidad_reservada) < Number(d.cantidad_solicitada)
        ) {
          throw new ApiError(409, "El stock reservado ya no coincide con la transferencia");
        }

        const stockNuevo = await client.query(
          `UPDATE stock
           SET cantidad = cantidad - $1,
               cantidad_reservada = cantidad_reservada - $4,
               fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id_producto = $2
             AND id_almacen = $3
             AND cantidad >= $1
             AND cantidad_reservada >= $4
           RETURNING cantidad`,
          [
            d.cantidad_solicitada,
            d.id_producto,
            trf.almacen_origen,
            d.cantidad_solicitada,
          ],
        );
        if (!stockNuevo.rowCount) {
          throw new ApiError(409, "No fue posible descontar el stock reservado");
        }

        await client.query(
          `UPDATE detalle_transferencias
           SET cantidad_enviada = cantidad_solicitada
           WHERE id_detalle_transferencia = $1`,
          [d.id_detalle_transferencia],
        );
        await client.query(
          `INSERT INTO movimientos_inventario
             (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
              stock_anterior, stock_nuevo, referencia, observaciones)
           VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7, $8)`,
          [
            d.id_producto,
            trf.almacen_origen,
            id_usuario,
            d.cantidad_solicitada,
            stockAnterior.rows[0].cantidad,
            stockNuevo.rows[0].cantidad,
            trf.numero_transferencia,
            `Salida por transferencia hacia almacén ${trf.almacen_destino}`,
          ],
        );
      }
    } else if (estado === "RECIBIDA") {
      // Sumar stock al destino
      for (const d of detalles.rows) {
        const cantidadRecibida = Number(d.cantidad_enviada);
        if (!Number.isFinite(cantidadRecibida) || cantidadRecibida <= 0) {
          throw new ApiError(409, "La transferencia no tiene una cantidad enviada válida");
        }

        const stock = await client.query(
          `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (id_producto, id_almacen)
           DO UPDATE SET
             cantidad = stock.cantidad + EXCLUDED.cantidad,
             fecha_actualizacion = CURRENT_TIMESTAMP
           RETURNING cantidad, cantidad - $3::numeric AS stock_anterior`,
          [d.id_producto, trf.almacen_destino, cantidadRecibida],
        );
        await client.query(
          `UPDATE detalle_transferencias
           SET cantidad_recibida = cantidad_enviada
           WHERE id_detalle_transferencia = $1`,
          [d.id_detalle_transferencia],
        );
        await client.query(
          `INSERT INTO movimientos_inventario
             (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
              stock_anterior, stock_nuevo, referencia, observaciones)
           VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7, $8)`,
          [
            d.id_producto,
            trf.almacen_destino,
            id_usuario,
            cantidadRecibida,
            stock.rows[0].stock_anterior,
            stock.rows[0].cantidad,
            trf.numero_transferencia,
            `Entrada por transferencia desde almacén ${trf.almacen_origen}`,
          ],
        );
      }
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

module.exports = {
  crearTransferencia,
  listarTransferencias,
  obtenerTransferencia,
  cambiarEstado,
};
