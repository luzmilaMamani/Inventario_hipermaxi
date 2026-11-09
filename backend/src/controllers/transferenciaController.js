const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const {
  enviarLotesTransferencia,
  recibirLotesTransferencia,
} = require("../services/lotesMovimientos");

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

/**
 * RF57: devuelve al stock disponible del origen lo reservado por cada línea.
 */
const liberarReservas = async (client, transferencia) => {
  const detalles = await client.query(
    `SELECT id_detalle_transferencia, id_producto, cantidad_reservada
     FROM detalle_transferencias
     WHERE id_transferencia = $1 AND cantidad_reservada > 0`,
    [transferencia.id_transferencia],
  );

  for (const d of detalles.rows) {
    await client.query(
      `UPDATE stock
       SET cantidad_reservada = GREATEST(COALESCE(cantidad_reservada, 0) - $1::numeric, 0),
           fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id_producto = $2 AND id_almacen = $3`,
      [d.cantidad_reservada, d.id_producto, transferencia.almacen_origen],
    );
    await client.query(
      `UPDATE detalle_transferencias SET cantidad_reservada = 0
       WHERE id_detalle_transferencia = $1`,
      [d.id_detalle_transferencia],
    );
  }
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
    `SELECT vt.*, tr.fecha_llegada_estimada, tr.observaciones,
       tr.fecha_aprobacion AS fecha_aprobacion_trazabilidad,
       tr.fecha_rechazo AS fecha_rechazo_trazabilidad,
       tr.fecha_cancelacion AS fecha_cancelacion_trazabilidad,
       tr.fecha_envio AS fecha_envio_trazabilidad,
       tr.fecha_recepcion AS fecha_recepcion_trazabilidad,
       tr.motivo_cancelacion,
       uc.nombre_completo AS usuario_cancela,
       tr.observaciones_recepcion,
       ur.nombre_completo AS usuario_recibe
     FROM vw_transferencias vt
     INNER JOIN transferencias tr ON tr.id_transferencia = vt.id_transferencia
     LEFT JOIN usuarios uc ON uc.id_usuario = tr.id_usuario_cancela
     LEFT JOIN usuarios ur ON ur.id_usuario = tr.id_usuario_recibe
     WHERE vt.id_transferencia = $1`,
    [id]
  );

  if (!result.rowCount) throw new ApiError(404, "Transferencia no encontrada");

  const detalles = await db.query(
    `SELECT dt.*, p.nombre AS producto, p.codigo, p.codigo AS producto_codigo
     FROM detalle_transferencias dt
     INNER JOIN productos p ON p.id_producto = dt.id_producto
     WHERE dt.id_transferencia = $1
     ORDER BY dt.id_detalle_transferencia`,
    [id]
  );

  res.json({ ok: true, data: { ...result.rows[0], detalles: detalles.rows } });
});

/**
 * RF58: GET /api/transferencias/diferencias
 * Líneas recibidas con faltante o sobrante, para que el almacén de origen
 * (o el de destino) consulte las diferencias.
 */
const listarDiferenciasTransferencias = asyncHandler(async (req, res) => {
  const condiciones = ["t.estado = 'RECIBIDA_CON_DIFERENCIAS'", "dt.diferencia <> 0"];
  const valores = [];

  for (const [parametro, columna] of [
    ["id_almacen_origen", "t.almacen_origen"],
    ["id_almacen_destino", "t.almacen_destino"],
  ]) {
    if (req.query[parametro] === undefined || req.query[parametro] === "") continue;
    const idAlmacen = Number(req.query[parametro]);
    if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
      throw new ApiError(400, "El almacén no es válido");
    }
    valores.push(idAlmacen);
    condiciones.push(`${columna} = $${valores.length}`);
  }

  for (const [parametro, operador] of [
    ["fecha_desde", ">="],
    ["fecha_hasta", "<"],
  ]) {
    const fecha = req.query[parametro];
    if (!fecha) continue;
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new ApiError(400, `La fecha ${parametro} no es válida`);
    }
    valores.push(fecha);
    condiciones.push(
      operador === "<"
        ? `t.fecha_recepcion < $${valores.length}::date + 1`
        : `t.fecha_recepcion >= $${valores.length}::date`,
    );
  }

  if (req.query.tipo === "FALTANTE") condiciones.push("dt.diferencia < 0");
  if (req.query.tipo === "SOBRANTE") condiciones.push("dt.diferencia > 0");

  const result = await db.query(
    `SELECT
       dt.id_detalle_transferencia,
       t.id_transferencia,
       t.numero_transferencia,
       t.fecha_envio,
       t.fecha_recepcion,
       t.almacen_origen AS id_almacen_origen,
       ao.nombre AS almacen_origen,
       t.almacen_destino AS id_almacen_destino,
       ad.nombre AS almacen_destino,
       ur.nombre_completo AS usuario_recibe,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       dt.cantidad_enviada,
       dt.cantidad_recibida,
       dt.diferencia,
       dt.observaciones AS observacion
     FROM detalle_transferencias dt
     INNER JOIN transferencias t ON t.id_transferencia = dt.id_transferencia
     INNER JOIN almacenes ao ON ao.id_almacen = t.almacen_origen
     INNER JOIN almacenes ad ON ad.id_almacen = t.almacen_destino
     INNER JOIN productos p ON p.id_producto = dt.id_producto
     LEFT JOIN usuarios ur ON ur.id_usuario = t.id_usuario_recibe
     WHERE ${condiciones.join(" AND ")}
     ORDER BY t.fecha_recepcion DESC, t.id_transferencia DESC, dt.id_detalle_transferencia
     LIMIT 500`,
    valores,
  );

  const resumen = result.rows.reduce(
    (total, linea) => {
      const diferencia = Number(linea.diferencia);
      if (diferencia < 0) total.faltante += -diferencia;
      else total.sobrante += diferencia;
      total.transferencias.add(linea.id_transferencia);
      return total;
    },
    { faltante: 0, sobrante: 0, transferencias: new Set() },
  );

  res.json({
    ok: true,
    data: result.rows,
    resumen: {
      total_faltante: resumen.faltante,
      total_sobrante: resumen.sobrante,
      transferencias: resumen.transferencias.size,
      lineas: result.rows.length,
    },
  });
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

    // RF57: la solicitud reserva el stock en origen hasta enviarse o cancelarse.
    // RF43/RF61: las unidades vencidas o en cuarentena no se pueden transferir.
    for (const d of detalles) {
      const cantidad = Number(d.cantidad);
      const reserva = await client.query(
        `UPDATE stock
         SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + $1::numeric,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_producto = $2 AND id_almacen = $3
           AND cantidad - COALESCE(cantidad_reservada, 0)
               - fn_cantidad_no_disponible(id_producto, id_almacen) >= $1::numeric
         RETURNING id_stock`,
        [cantidad, d.id_producto, idAlmacenOrigen],
      );
      if (!reserva.rowCount) {
        throw new ApiError(
          400,
          `Stock disponible insuficiente en el origen para el producto ${d.id_producto} (no se cuentan lo reservado ni los lotes vencidos o en cuarentena)`,
        );
      }

      await client.query(
        `INSERT INTO detalle_transferencias (id_transferencia, id_producto, cantidad_solicitada, cantidad_reservada)
         VALUES ($1, $2, $3, $3)`,
        [transferencia.id_transferencia, d.id_producto, cantidad]
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
         SET estado = $1::varchar,
             id_usuario_aprueba = CASE WHEN $1::varchar = 'APROBADA' THEN $2 ELSE id_usuario_aprueba END,
             ${columnaFecha} = CURRENT_TIMESTAMP
         WHERE id_transferencia = $3`,
        [estado, req.user.id_usuario, id],
      );
      if (estado === "RECHAZADA") {
        await liberarReservas(client, transferencia);
      }
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
        `SELECT id_detalle_transferencia, id_producto, cantidad_solicitada,
                cantidad_reservada
         FROM detalle_transferencias WHERE id_transferencia = $1`,
        [id]
      );

      for (const d of detalles.rows) {
        // Los lotes salen por FEFO: nunca vencidos ni en cuarentena.
        await enviarLotesTransferencia(client, {
          idDetalle: d.id_detalle_transferencia,
          idProducto: d.id_producto,
          idAlmacen: transferencia.almacen_origen,
          cantidad: Number(d.cantidad_solicitada),
        });

        const stockRes = await client.query(
          `SELECT id_stock, cantidad, cantidad_reservada
           FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
          [d.id_producto, transferencia.almacen_origen]
        );
        // Lo reservado por esta misma transferencia cuenta como disponible para enviarla.
        const reservadoLinea = Number(d.cantidad_reservada || 0);
        if (!stockRes.rowCount) {
          throw new ApiError(400, `Stock insuficiente en el origen para el producto ${d.id_producto}`);
        }
        // Los lotes ya se descontaron, por eso no se resta de nuevo lo que no está disponible.
        const disponible =
          Number(stockRes.rows[0].cantidad) -
          Number(stockRes.rows[0].cantidad_reservada || 0) +
          reservadoLinea;
        if (disponible < Number(d.cantidad_solicitada)) {
          throw new ApiError(400, `Stock insuficiente en el origen para el producto ${d.id_producto} (no se cuenta lo reservado por otras operaciones)`);
        }

        const nuevoStock = Number(stockRes.rows[0].cantidad) - Number(d.cantidad_solicitada);
        const nuevaReserva = Math.max(
          Number(stockRes.rows[0].cantidad_reservada || 0) - reservadoLinea,
          0,
        );
        await client.query(
          `UPDATE stock SET cantidad = $1, cantidad_reservada = $2, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_stock = $3`,
          [nuevoStock, nuevaReserva, stockRes.rows[0].id_stock]
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
           SET cantidad_enviada = cantidad_solicitada,
               cantidad_reservada = 0
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

      const observacionesRecepcion =
        typeof req.body.observaciones_recepcion === "string"
          ? req.body.observaciones_recepcion.trim()
          : "";
      if (observacionesRecepcion.length > 500) {
        throw new ApiError(400, "La observación de la recepción no puede superar los 500 caracteres");
      }

      const recepciones = new Map();
      for (const [index, detalle] of detalles_recibidos.entries()) {
        const idDetalle = Number(detalle?.id_detalle_transferencia);
        const cantidadRecibida = Number(detalle?.cantidad_recibida);
        if (
          typeof detalle?.id_detalle_transferencia === "boolean" ||
          typeof detalle?.cantidad_recibida === "boolean" ||
          !Number.isSafeInteger(idDetalle) ||
          !Number.isSafeInteger(cantidadRecibida) ||
          cantidadRecibida < 0 ||
          recepciones.has(idDetalle)
        ) {
          throw new ApiError(400, `La cantidad recibida de la línea ${index + 1} no es válida`);
        }
        const observacion =
          typeof detalle?.observacion === "string" ? detalle.observacion.trim() : "";
        if (observacion.length > 300) {
          throw new ApiError(400, `La observación de la línea ${index + 1} no puede superar los 300 caracteres`);
        }
        recepciones.set(idDetalle, { cantidadRecibida, observacion });
      }

      // RF58: se calcula la diferencia por producto contra lo enviado.
      // Negativa = faltante, positiva = sobrante. Toda diferencia debe explicarse.
      let lineasConDiferencia = 0;
      for (const d of detalles.rows) {
        const recepcion = recepciones.get(d.id_detalle_transferencia);
        if (!recepcion) {
          throw new ApiError(400, "Falta la cantidad recibida para un producto");
        }
        recepcion.diferencia = recepcion.cantidadRecibida - Number(d.cantidad_enviada);
        if (recepcion.diferencia !== 0) {
          lineasConDiferencia += 1;
          if (recepcion.observacion.length < 5) {
            throw new ApiError(
              400,
              `El producto ${d.id_producto} tiene un ${recepcion.diferencia < 0 ? "faltante" : "sobrante"} de ${Math.abs(recepcion.diferencia)}: indique una observación (mínimo 5 caracteres)`,
            );
          }
        }
      }
      const estadoRecepcion = lineasConDiferencia > 0 ? "RECIBIDA_CON_DIFERENCIAS" : "RECIBIDA";

      for (const d of detalles.rows) {
        const { cantidadRecibida, observacion, diferencia } = recepciones.get(
          d.id_detalle_transferencia,
        );

        await recibirLotesTransferencia(client, {
          idDetalle: d.id_detalle_transferencia,
          idProducto: d.id_producto,
          idAlmacenDestino: transferencia.almacen_destino,
          numeroTransferencia: transferencia.numero_transferencia,
          cantidadRecibida,
        });

        // Solo se suma al stock del destino lo realmente recibido.
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
              (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
             VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $5, $6, $7, $8)`,
            [
              d.id_producto,
              transferencia.almacen_destino,
              req.user.id_usuario,
              cantidadRecibida,
              stockRes.rows[0].stock_anterior,
              stockRes.rows[0].cantidad,
              transferencia.numero_transferencia,
              diferencia === 0
                ? null
                : `Recepción con ${diferencia < 0 ? "faltante" : "sobrante"} de ${Math.abs(diferencia)} (enviado ${Number(d.cantidad_enviada)}): ${observacion}`,
            ]
          );
        }

        await client.query(
          `UPDATE detalle_transferencias
           SET cantidad_recibida = $1,
               diferencia = $2,
               observaciones = $3
           WHERE id_detalle_transferencia = $4`,
          [cantidadRecibida, diferencia, observacion || null, d.id_detalle_transferencia],
        );
      }

      await client.query(
        `UPDATE transferencias
         SET estado = $1,
             fecha_recepcion = CURRENT_TIMESTAMP,
             id_usuario_recibe = $2,
             observaciones_recepcion = $3
         WHERE id_transferencia = $4`,
        [estadoRecepcion, req.user.id_usuario, observacionesRecepcion || null, id]
      );

      await client.query("COMMIT");
      return res.json({
        ok: true,
        message:
          estadoRecepcion === "RECIBIDA"
            ? "Transferencia recibida sin diferencias"
            : `Transferencia recibida con diferencias en ${lineasConDiferencia} producto(s). Solo se sumó al stock lo realmente recibido.`,
        data: { estado: estadoRecepcion, lineas_con_diferencia: lineasConDiferencia },
      });
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

/**
 * RF57: Cancelar una solicitud que aún no fue enviada
 */
const cancelarTransferencia = asyncHandler(async (req, res) => {
  const idTransferencia = Number(req.params.id);
  if (!Number.isSafeInteger(idTransferencia) || idTransferencia <= 0) {
    throw new ApiError(400, "El ID de la transferencia no es válido");
  }
  if (!["ENCARGADO_ALMACEN", "ADMINISTRADOR"].includes(req.user.rol)) {
    throw new ApiError(403, "Solo un encargado o administrador puede cancelar transferencias");
  }

  const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
  if (!motivo) {
    throw new ApiError(400, "Debe indicar el motivo de la cancelación");
  }
  if (motivo.length > 500) {
    throw new ApiError(400, "El motivo no puede superar los 500 caracteres");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const transfResult = await client.query(
      `SELECT * FROM transferencias WHERE id_transferencia = $1 FOR UPDATE`,
      [idTransferencia],
    );
    if (!transfResult.rowCount) throw new ApiError(404, "Transferencia no encontrada");
    const transferencia = transfResult.rows[0];

    if (!["SOLICITADA", "APROBADA"].includes(transferencia.estado)) {
      throw new ApiError(
        400,
        `Solo se pueden cancelar transferencias SOLICITADAS o APROBADAS; esta está ${transferencia.estado}`,
      );
    }

    await liberarReservas(client, transferencia);

    await client.query(
      `UPDATE transferencias
       SET estado = 'CANCELADA',
           motivo_cancelacion = $1,
           id_usuario_cancela = $2,
           fecha_cancelacion = CURRENT_TIMESTAMP
       WHERE id_transferencia = $3`,
      [motivo, req.user.id_usuario, idTransferencia],
    );

    await client.query("COMMIT");
    res.json({ ok: true, message: "Transferencia cancelada y stock reservado liberado" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listarTransferencias,
  obtenerTransferencia,
  listarDiferenciasTransferencias,
  crearTransferencia,
  cambiarEstado,
  cancelarTransferencia,
};