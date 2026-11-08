const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const ESTADOS_REPOSICION = new Set(["REPUESTA", "SIN_REPOSICION"]);

function enteroPositivo(valor) {
  if (typeof valor === "boolean") return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function fechaValida(fecha) {
  return typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

async function generarNumeroDevolucion(client) {
  const year = new Date().getFullYear();
  await client.query("SELECT pg_advisory_xact_lock(hashtext('DEVOLUCION_PROVEEDOR'), $1)", [year]);
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM devoluciones_proveedor
     WHERE fecha_devolucion >= $1 AND fecha_devolucion < $2`,
    [`${year}-01-01 00:00:00`, `${year + 1}-01-01 00:00:00`],
  );
  return `DVP-${year}-${String(result.rows[0].total + 1).padStart(4, "0")}`;
}

const SELECT_RECEPCION = `
  SELECT
    e.id_entrada,
    e.numero_entrada,
    e.referencia_externa,
    e.fecha_entrada,
    e.origen AS proveedor,
    e.id_almacen,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen,
    (SELECT COALESCE(SUM(de.cantidad_recibida), 0)::int
       FROM detalle_entradas de WHERE de.id_entrada = e.id_entrada) AS total_recibido,
    (SELECT COALESCE(SUM(ddp.cantidad), 0)::int
       FROM detalle_devoluciones_proveedor ddp
       INNER JOIN detalle_entradas de ON de.id_detalle_entrada = ddp.id_detalle_entrada
       WHERE de.id_entrada = e.id_entrada) AS total_devuelto
  FROM entradas_inventario e
  INNER JOIN almacenes a ON a.id_almacen = e.id_almacen
  WHERE e.stock_confirmado = TRUE`;

// Líneas de una recepción con lo recibido, lo ya devuelto y lo que aún puede devolverse.
async function obtenerLineasRecepcion(conexion, idEntrada) {
  const result = await conexion.query(
    `SELECT
       de.id_detalle_entrada,
       de.id_producto,
       de.id_lote,
       de.cantidad_recibida::int AS cantidad_recibida,
       COALESCE(dev.devuelto, 0)::int AS cantidad_devuelta,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       um.abreviatura AS unidad,
       lp.numero_lote,
       TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
       COALESCE(lp.cantidad_actual, 0)::int AS cantidad_en_lote
     FROM detalle_entradas de
     INNER JOIN productos p ON p.id_producto = de.id_producto
     LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN lotes_productos lp ON lp.id_lote = de.id_lote
     LEFT JOIN (
       SELECT id_detalle_entrada, SUM(cantidad) AS devuelto
       FROM detalle_devoluciones_proveedor
       GROUP BY id_detalle_entrada
     ) dev ON dev.id_detalle_entrada = de.id_detalle_entrada
     WHERE de.id_entrada = $1
     ORDER BY de.id_detalle_entrada`,
    [idEntrada],
  );
  return result.rows.map((linea) => ({
    ...linea,
    cantidad_disponible: Math.max(linea.cantidad_recibida - linea.cantidad_devuelta, 0),
  }));
}

/**
 * GET /api/devoluciones-proveedor/recepciones?search=
 * Busca recepciones confirmadas por número, referencia o proveedor.
 */
const buscarRecepciones = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  if (search.length < 2) {
    throw new ApiError(400, "Ingrese al menos 2 caracteres del número, referencia o proveedor");
  }
  const result = await db.query(
    `${SELECT_RECEPCION}
       AND (e.numero_entrada ILIKE $1 OR e.referencia_externa ILIKE $1 OR e.origen ILIKE $1)
     ORDER BY e.fecha_entrada DESC, e.id_entrada DESC
     LIMIT 20`,
    [`%${search}%`],
  );
  res.json({ ok: true, data: result.rows });
});

/**
 * GET /api/devoluciones-proveedor/recepciones/:id
 * Detalle de una recepción confirmada con las cantidades que aún pueden devolverse.
 */
const obtenerRecepcionDevolvible = asyncHandler(async (req, res) => {
  const id = enteroPositivo(req.params.id);
  if (!id) throw new ApiError(400, "Recepción no válida");

  const recepcion = await db.query(`${SELECT_RECEPCION} AND e.id_entrada = $1`, [id]);
  if (!recepcion.rowCount) throw new ApiError(404, "Recepción no encontrada o aún no confirmada");

  const lineas = await obtenerLineasRecepcion(db, id);
  res.json({ ok: true, data: { ...recepcion.rows[0], lineas } });
});

/**
 * POST /api/devoluciones-proveedor
 * Registra y confirma la devolución: descuenta lote y stock y genera el
 * movimiento DEVOLUCION_PROVEEDOR por cada línea.
 */
const crearDevolucionProveedor = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }
  const idEntrada = enteroPositivo(req.body.id_entrada);
  const motivo = typeof req.body.motivo === "string" ? req.body.motivo.trim() : "";
  const observaciones =
    typeof req.body.observaciones === "string" ? req.body.observaciones.trim() : "";
  const detalles = req.body.detalles;

  if (!idEntrada) throw new ApiError(400, "Debe indicar la recepción de referencia");
  if (motivo.length < 5) {
    throw new ApiError(400, "Debe indicar el motivo de la devolución (mínimo 5 caracteres)");
  }
  if (motivo.length > 500) throw new ApiError(400, "El motivo no puede superar los 500 caracteres");
  if (observaciones.length > 500) {
    throw new ApiError(400, "Las observaciones no pueden superar los 500 caracteres");
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    throw new ApiError(400, "Debe indicar entre 1 y 100 productos a devolver");
  }

  const lineasSolicitadas = detalles.map((detalle, index) => {
    const posicion = index + 1;
    const idDetalleEntrada = enteroPositivo(detalle?.id_detalle_entrada);
    const cantidad = enteroPositivo(detalle?.cantidad);
    const observacion =
      typeof detalle?.observacion === "string" ? detalle.observacion.trim() : "";
    if (!idDetalleEntrada) {
      throw new ApiError(400, `El producto de la línea ${posicion} no es válido`);
    }
    if (!cantidad) {
      throw new ApiError(400, `La cantidad de la línea ${posicion} debe ser un número entero mayor a 0`);
    }
    if (observacion.length > 300) {
      throw new ApiError(400, `La observación de la línea ${posicion} no puede superar los 300 caracteres`);
    }
    return { idDetalleEntrada, cantidad, observacion: observacion || null, posicion };
  });
  const repetidas = new Set();
  for (const linea of lineasSolicitadas) {
    if (repetidas.has(linea.idDetalleEntrada)) {
      throw new ApiError(400, `La línea ${linea.posicion} repite un producto de la recepción`);
    }
    repetidas.add(linea.idDetalleEntrada);
  }

  const idUsuario = req.user.id_usuario;
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // Bloquea la recepción para que dos devoluciones simultáneas no superen lo recibido.
    const recepcionResult = await client.query(
      `SELECT id_entrada, numero_entrada, referencia_externa, id_almacen, origen, stock_confirmado
       FROM entradas_inventario
       WHERE id_entrada = $1
       FOR UPDATE`,
      [idEntrada],
    );
    const recepcion = recepcionResult.rows[0];
    if (!recepcion) throw new ApiError(404, "La recepción de referencia no existe");
    if (!recepcion.stock_confirmado) {
      throw new ApiError(
        400,
        "La recepción aún no fue confirmada, por lo que no sumó stock; no se puede devolver",
      );
    }
    const proveedor = String(recepcion.origen || "").trim();
    if (!proveedor) throw new ApiError(400, "La recepción no tiene proveedor registrado");

    const lineasRecepcion = new Map(
      (await obtenerLineasRecepcion(client, idEntrada)).map((linea) => [
        linea.id_detalle_entrada,
        linea,
      ]),
    );

    // Criterio: no se puede devolver más de lo recibido en esa recepción.
    for (const solicitud of lineasSolicitadas) {
      const linea = lineasRecepcion.get(solicitud.idDetalleEntrada);
      if (!linea) {
        throw new ApiError(
          400,
          `La línea ${solicitud.posicion} no forma parte de la recepción ${recepcion.numero_entrada}`,
        );
      }
      if (solicitud.cantidad > linea.cantidad_disponible) {
        throw new ApiError(
          400,
          `No se puede devolver más de lo recibido para ${linea.producto}: recibido ${linea.cantidad_recibida}, ya devuelto ${linea.cantidad_devuelta}, solicitado ${solicitud.cantidad}`,
        );
      }
      solicitud.linea = linea;
    }

    const numeroDevolucion = await generarNumeroDevolucion(client);
    const devolucionResult = await client.query(
      `INSERT INTO devoluciones_proveedor
         (numero_devolucion, id_entrada, id_almacen, proveedor, motivo, observaciones, id_usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        numeroDevolucion,
        idEntrada,
        recepcion.id_almacen,
        proveedor,
        motivo,
        observaciones || null,
        idUsuario,
      ],
    );
    const devolucion = devolucionResult.rows[0];
    let totalDevuelto = 0;

    for (const solicitud of lineasSolicitadas) {
      const { linea, cantidad } = solicitud;

      let lote = null;
      if (linea.id_lote) {
        const loteResult = await client.query(
          `SELECT id_lote, numero_lote, cantidad_actual
           FROM lotes_productos
           WHERE id_lote = $1
           FOR UPDATE`,
          [linea.id_lote],
        );
        lote = loteResult.rows[0] || null;
        if (lote && Number(lote.cantidad_actual) < cantidad) {
          throw new ApiError(
            400,
            `El lote ${lote.numero_lote} de ${linea.producto} solo tiene ${Number(lote.cantidad_actual)} unidad(es); el resto ya salió del almacén`,
          );
        }
      }

      const stockResult = await client.query(
        `SELECT id_stock, cantidad, COALESCE(cantidad_reservada, 0) AS cantidad_reservada
         FROM stock
         WHERE id_producto = $1 AND id_almacen = $2
         FOR UPDATE`,
        [linea.id_producto, recepcion.id_almacen],
      );
      const stock = stockResult.rows[0];
      const stockAnterior = Number(stock?.cantidad || 0);
      const disponible = stockAnterior - Number(stock?.cantidad_reservada || 0);
      if (!stock || disponible < cantidad) {
        throw new ApiError(
          400,
          `Stock insuficiente de ${linea.producto} para devolver ${cantidad}: disponible ${Math.max(disponible, 0)} (no se cuenta lo reservado)`,
        );
      }
      const stockNuevo = stockAnterior - cantidad;

      // El stock disminuye al confirmar la devolución.
      await client.query(
        `UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [stockNuevo, stock.id_stock],
      );
      if (lote) {
        await client.query(
          `UPDATE lotes_productos
           SET cantidad_actual = cantidad_actual - $1::numeric,
               estado = CASE WHEN cantidad_actual - $1::numeric = 0 THEN 'AGOTADO' ELSE estado END
           WHERE id_lote = $2`,
          [cantidad, lote.id_lote],
        );
      }

      const movimientoResult = await client.query(
        `INSERT INTO movimientos_inventario
           (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento,
            cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
         VALUES ($1, $2, $3, $4, 'DEVOLUCION_PROVEEDOR', $5, $6, $7, $8, $9)
         RETURNING id_movimiento`,
        [
          linea.id_producto,
          recepcion.id_almacen,
          lote?.id_lote || null,
          idUsuario,
          cantidad,
          stockAnterior,
          stockNuevo,
          numeroDevolucion,
          `Devolución a proveedor ${proveedor} (recepción ${recepcion.numero_entrada}): ${solicitud.observacion || motivo}`,
        ],
      );

      await client.query(
        `INSERT INTO detalle_devoluciones_proveedor
           (id_devolucion_proveedor, id_detalle_entrada, id_producto, id_lote,
            cantidad, observacion, id_movimiento)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          devolucion.id_devolucion_proveedor,
          linea.id_detalle_entrada,
          linea.id_producto,
          lote?.id_lote || null,
          cantidad,
          solicitud.observacion,
          movimientoResult.rows[0].id_movimiento,
        ],
      );
      totalDevuelto += cantidad;
    }

    await client.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: `Devolución ${numeroDevolucion} confirmada: ${totalDevuelto} unidad(es) descontadas del stock y pendientes de reposición por ${proveedor}`,
      data: { ...devolucion, total_devuelto: totalDevuelto },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la devolución a proveedor:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
});

/**
 * GET /api/devoluciones-proveedor
 * Historial paginado de devoluciones a proveedor.
 */
const listarDevolucionesProveedor = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];

  if (req.query.id_almacen) {
    const idAlmacen = enteroPositivo(req.query.id_almacen);
    if (!idAlmacen) throw new ApiError(400, "El almacén no es válido");
    valores.push(idAlmacen);
    condiciones.push(`d.id_almacen = $${valores.length}`);
  }
  if (req.query.estado_reposicion) {
    const estado = String(req.query.estado_reposicion).toUpperCase();
    if (!["PENDIENTE", ...ESTADOS_REPOSICION].includes(estado)) {
      throw new ApiError(400, "El estado de reposición no es válido");
    }
    valores.push(estado);
    condiciones.push(`d.estado_reposicion = $${valores.length}`);
  }
  for (const [parametro, operador] of [
    ["fecha_desde", ">="],
    ["fecha_hasta", "<"],
  ]) {
    const fecha = req.query[parametro];
    if (!fecha) continue;
    if (!fechaValida(fecha)) throw new ApiError(400, `La fecha ${parametro} no es válida`);
    valores.push(fecha);
    condiciones.push(
      operador === "<"
        ? `d.fecha_devolucion < $${valores.length}::date + 1`
        : `d.fecha_devolucion >= $${valores.length}::date`,
    );
  }
  const search = String(req.query.search || "").trim();
  if (search) {
    valores.push(`%${search}%`);
    const n = valores.length;
    condiciones.push(
      `(d.numero_devolucion ILIKE $${n} OR d.proveedor ILIKE $${n} OR e.numero_entrada ILIKE $${n} OR e.referencia_externa ILIKE $${n})`,
    );
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const fromSql = `
    FROM devoluciones_proveedor d
    INNER JOIN entradas_inventario e ON e.id_entrada = d.id_entrada
    INNER JOIN almacenes a ON a.id_almacen = d.id_almacen
    INNER JOIN usuarios u ON u.id_usuario = d.id_usuario`;

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         d.*,
         e.numero_entrada,
         e.referencia_externa AS referencia_recepcion,
         a.nombre AS almacen,
         u.nombre_completo AS usuario_registra,
         (SELECT COALESCE(SUM(cantidad), 0)::int FROM detalle_devoluciones_proveedor dd
           WHERE dd.id_devolucion_proveedor = d.id_devolucion_proveedor) AS total_devuelto
       ${fromSql}
       ${whereSql}
       ORDER BY d.fecha_devolucion DESC, d.id_devolucion_proveedor DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`, valores),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

/**
 * GET /api/devoluciones-proveedor/:id
 */
const obtenerDevolucionProveedor = asyncHandler(async (req, res) => {
  const id = enteroPositivo(req.params.id);
  if (!id) throw new ApiError(400, "Devolución no válida");

  const cabecera = await db.query(
    `SELECT
       d.*,
       e.numero_entrada,
       e.referencia_externa AS referencia_recepcion,
       e.fecha_entrada,
       a.nombre AS almacen,
       u.nombre_completo AS usuario_registra,
       ur.nombre_completo AS usuario_reposicion
     FROM devoluciones_proveedor d
     INNER JOIN entradas_inventario e ON e.id_entrada = d.id_entrada
     INNER JOIN almacenes a ON a.id_almacen = d.id_almacen
     INNER JOIN usuarios u ON u.id_usuario = d.id_usuario
     LEFT JOIN usuarios ur ON ur.id_usuario = d.id_usuario_reposicion
     WHERE d.id_devolucion_proveedor = $1`,
    [id],
  );
  if (!cabecera.rowCount) throw new ApiError(404, "Devolución a proveedor no encontrada");

  const detalles = await db.query(
    `SELECT
       dd.*,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       um.abreviatura AS unidad,
       lp.numero_lote
     FROM detalle_devoluciones_proveedor dd
     INNER JOIN productos p ON p.id_producto = dd.id_producto
     LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN lotes_productos lp ON lp.id_lote = dd.id_lote
     WHERE dd.id_devolucion_proveedor = $1
     ORDER BY dd.id_detalle_devolucion_proveedor`,
    [id],
  );

  res.json({ ok: true, data: { ...cabecera.rows[0], detalles: detalles.rows } });
});

/**
 * PUT /api/devoluciones-proveedor/:id/reposicion
 * Cierra la gestión de reposición: el proveedor repuso la mercadería o no habrá reposición.
 * La mercadería repuesta ingresa al stock con una nueva recepción.
 */
const registrarReposicion = asyncHandler(async (req, res) => {
  const id = enteroPositivo(req.params.id);
  if (!id) throw new ApiError(400, "Devolución no válida");
  const estado = String(req.body?.estado_reposicion || "").toUpperCase();
  if (!ESTADOS_REPOSICION.has(estado)) {
    throw new ApiError(400, "El estado de reposición debe ser REPUESTA o SIN_REPOSICION");
  }
  const observacion =
    typeof req.body?.observacion === "string" ? req.body.observacion.trim() : "";
  if (estado === "SIN_REPOSICION" && observacion.length < 5) {
    throw new ApiError(400, "Indique por qué no habrá reposición (mínimo 5 caracteres)");
  }
  if (observacion.length > 500) {
    throw new ApiError(400, "La observación no puede superar los 500 caracteres");
  }

  const result = await db.query(
    `UPDATE devoluciones_proveedor
     SET estado_reposicion = $1,
         fecha_reposicion = CURRENT_TIMESTAMP,
         id_usuario_reposicion = $2,
         observacion_reposicion = $3
     WHERE id_devolucion_proveedor = $4 AND estado_reposicion = 'PENDIENTE'
     RETURNING *`,
    [estado, req.user.id_usuario, observacion || null, id],
  );
  if (!result.rowCount) {
    const existe = await db.query(
      "SELECT estado_reposicion FROM devoluciones_proveedor WHERE id_devolucion_proveedor = $1",
      [id],
    );
    if (!existe.rowCount) throw new ApiError(404, "Devolución a proveedor no encontrada");
    throw new ApiError(400, `La reposición de esta devolución ya fue registrada como ${existe.rows[0].estado_reposicion}`);
  }

  res.json({
    ok: true,
    message:
      estado === "REPUESTA"
        ? "Reposición registrada. Registre la recepción de la mercadería repuesta para sumarla al stock."
        : "Devolución cerrada sin reposición",
    data: result.rows[0],
  });
});

module.exports = {
  buscarRecepciones,
  obtenerRecepcionDevolvible,
  crearDevolucionProveedor,
  listarDevolucionesProveedor,
  obtenerDevolucionProveedor,
  registrarReposicion,
};
