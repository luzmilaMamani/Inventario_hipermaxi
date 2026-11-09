const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { generarNumeroSalida } = require("./salidaController");

const ESTADOS_PRODUCTO = new Set(["APTO", "NO_APTO"]);

function enteroPositivo(valor) {
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

async function generarNumeroDevolucion(client) {
  const year = new Date().getFullYear();
  await client.query("SELECT pg_advisory_xact_lock(hashtext('DEVOLUCION'), $1)", [year]);
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM devoluciones
     WHERE fecha_devolucion >= $1 AND fecha_devolucion < $2`,
    [`${year}-01-01 00:00:00`, `${year + 1}-01-01 00:00:00`],
  );
  return `DEV-${year}-${String(result.rows[0].total + 1).padStart(4, "0")}`;
}

// Líneas de una venta con lo vendido, lo ya devuelto y lo que aún se puede devolver.
async function obtenerLineasVenta(conexion, id_salida) {
  const result = await conexion.query(
    `SELECT
       ds.id_detalle_salida,
       ds.id_producto,
       ds.id_lote,
       ds.cantidad::int AS cantidad_vendida,
       COALESCE(ds.precio_unitario, 0) AS precio_unitario,
       COALESCE(dev.devuelto, 0)::int AS cantidad_devuelta,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       um.abreviatura AS unidad,
       lp.numero_lote,
       TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento
     FROM detalle_salidas ds
     INNER JOIN productos p ON p.id_producto = ds.id_producto
     LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN lotes_productos lp ON lp.id_lote = ds.id_lote
     LEFT JOIN (
       SELECT id_detalle_salida, SUM(cantidad) AS devuelto
       FROM detalle_devoluciones
       GROUP BY id_detalle_salida
     ) dev ON dev.id_detalle_salida = ds.id_detalle_salida
     WHERE ds.id_salida = $1
     ORDER BY ds.id_detalle_salida`,
    [id_salida],
  );
  return result.rows.map((linea) => ({
    ...linea,
    cantidad_disponible: linea.cantidad_vendida - linea.cantidad_devuelta,
  }));
}

// Resumen por producto (una venta puede repartir un producto en varios lotes).
function resumirPorProducto(lineas) {
  const productos = new Map();
  for (const linea of lineas) {
    const actual = productos.get(linea.id_producto) || {
      id_producto: linea.id_producto,
      producto_codigo: linea.producto_codigo,
      producto: linea.producto,
      unidad: linea.unidad,
      cantidad_vendida: 0,
      cantidad_devuelta: 0,
      cantidad_disponible: 0,
      lotes: [],
    };
    actual.cantidad_vendida += linea.cantidad_vendida;
    actual.cantidad_devuelta += linea.cantidad_devuelta;
    actual.cantidad_disponible += linea.cantidad_disponible;
    actual.lotes.push({
      id_lote: linea.id_lote,
      numero_lote: linea.numero_lote,
      fecha_vencimiento: linea.fecha_vencimiento,
      cantidad_vendida: linea.cantidad_vendida,
    });
    productos.set(linea.id_producto, actual);
  }
  return [...productos.values()];
}

const SELECT_VENTA = `
  SELECT
    s.id_salida,
    s.numero_salida,
    s.referencia_externa,
    s.fecha_salida,
    s.id_almacen,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen,
    (SELECT COALESCE(SUM(ds.cantidad), 0)::int FROM detalle_salidas ds WHERE ds.id_salida = s.id_salida) AS total_vendido,
    (SELECT COALESCE(SUM(dd.cantidad), 0)::int
       FROM detalle_devoluciones dd
       INNER JOIN detalle_salidas ds ON ds.id_detalle_salida = dd.id_detalle_salida
       WHERE ds.id_salida = s.id_salida) AS total_devuelto
  FROM salidas_inventario s
  INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
  WHERE s.motivo = 'VENTA' AND s.estado = 'CONFIRMADA'`;

/**
 * GET /api/devoluciones/ventas?search=
 * Busca ventas confirmadas por número de salida o referencia externa.
 */
const buscarVentas = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  if (search.length < 2) {
    throw new ApiError(400, "Ingrese al menos 2 caracteres de la referencia de venta");
  }
  const result = await db.query(
    `${SELECT_VENTA}
       AND (s.numero_salida ILIKE $1 OR s.referencia_externa ILIKE $1)
     ORDER BY s.fecha_salida DESC
     LIMIT 20`,
    [`%${search}%`],
  );
  res.json({ ok: true, data: result.rows });
});

/**
 * GET /api/devoluciones/ventas/:id
 * Detalle de una venta con las cantidades que aún pueden devolverse.
 */
const obtenerVentaDevolvible = asyncHandler(async (req, res) => {
  const id = enteroPositivo(req.params.id);
  if (!id) throw new ApiError(400, "Venta no válida");

  const venta = await db.query(`${SELECT_VENTA} AND s.id_salida = $1`, [id]);
  if (!venta.rowCount) throw new ApiError(404, "Venta no encontrada o no confirmada");

  const lineas = await obtenerLineasVenta(db, id);
  res.json({
    ok: true,
    data: { ...venta.rows[0], productos: resumirPorProducto(lineas) },
  });
});

/**
 * POST /api/devoluciones
 * Registra la devolución: lo apto vuelve al stock y lo no apto queda como salida por daño.
 */
const crearDevolucion = asyncHandler(async (req, res) => {
  const id_salida_venta = enteroPositivo(req.body?.id_salida_venta);
  const observaciones = String(req.body?.observaciones || "").trim() || null;
  const detalles = req.body?.detalles;

  if (!id_salida_venta) throw new ApiError(400, "Debe indicar la venta de referencia");
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new ApiError(400, "Debe indicar al menos un producto a devolver");
  }

  const lineasSolicitadas = detalles.map((detalle, index) => {
    const posicion = index + 1;
    const id_producto = enteroPositivo(detalle?.id_producto);
    const cantidad = enteroPositivo(detalle?.cantidad);
    const estado_producto = String(detalle?.estado_producto || "").toUpperCase();
    const motivo = String(detalle?.motivo || "").trim() || null;

    if (!id_producto) throw new ApiError(400, `El producto de la línea ${posicion} no es válido`);
    if (!cantidad) {
      throw new ApiError(400, `La cantidad de la línea ${posicion} debe ser un número entero mayor a 0`);
    }
    if (!ESTADOS_PRODUCTO.has(estado_producto)) {
      throw new ApiError(400, `El estado de la línea ${posicion} debe ser APTO o NO_APTO`);
    }
    if (estado_producto === "NO_APTO" && (!motivo || motivo.length < 5)) {
      throw new ApiError(
        400,
        `La línea ${posicion} es no apta: indique el motivo (mínimo 5 caracteres)`,
      );
    }
    return { id_producto, cantidad, estado_producto, motivo };
  });

  const id_usuario = req.user.id_usuario;
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // Bloquea la venta para que dos devoluciones simultáneas no superen lo vendido.
    const ventaResult = await client.query(
      `SELECT id_salida, numero_salida, referencia_externa, id_almacen, motivo, estado
       FROM salidas_inventario
       WHERE id_salida = $1
       FOR UPDATE`,
      [id_salida_venta],
    );
    const venta = ventaResult.rows[0];
    if (!venta || venta.motivo !== "VENTA") throw new ApiError(404, "La venta de referencia no existe");
    if (venta.estado !== "CONFIRMADA") {
      throw new ApiError(400, "Solo se pueden registrar devoluciones de ventas confirmadas");
    }

    const lineasVenta = await obtenerLineasVenta(client, id_salida_venta);
    const resumen = new Map(resumirPorProducto(lineasVenta).map((p) => [p.id_producto, p]));

    // Criterio: no se puede devolver más de lo vendido (sumando devoluciones previas).
    const solicitadoPorProducto = new Map();
    for (const linea of lineasSolicitadas) {
      solicitadoPorProducto.set(
        linea.id_producto,
        (solicitadoPorProducto.get(linea.id_producto) || 0) + linea.cantidad,
      );
    }
    for (const [id_producto, solicitado] of solicitadoPorProducto) {
      const producto = resumen.get(id_producto);
      if (!producto) {
        throw new ApiError(400, `El producto ${id_producto} no forma parte de la venta ${venta.numero_salida}`);
      }
      if (solicitado > producto.cantidad_disponible) {
        throw new ApiError(
          400,
          `No se puede devolver más de lo vendido para ${producto.producto}: vendido ${producto.cantidad_vendida}, ya devuelto ${producto.cantidad_devuelta}, solicitado ${solicitado}`,
        );
      }
    }

    const numero_devolucion = await generarNumeroDevolucion(client);
    const referenciaVenta = venta.referencia_externa
      ? `${venta.numero_salida} (${venta.referencia_externa})`
      : venta.numero_salida;

    let salidaDano = null;
    if (lineasSolicitadas.some((linea) => linea.estado_producto === "NO_APTO")) {
      const numero_salida = await generarNumeroSalida(client, "DANO");
      const salidaResult = await client.query(
        `INSERT INTO salidas_inventario
          (numero_salida, id_almacen, id_usuario, motivo,
           referencia_externa, observaciones, estado)
         VALUES ($1, $2, $3, 'DANO', $4, $5, 'CONFIRMADA')
         RETURNING *`,
        [
          numero_salida,
          venta.id_almacen,
          id_usuario,
          numero_devolucion,
          `Productos no aptos de la devolución ${numero_devolucion} de la venta ${referenciaVenta}`,
        ],
      );
      salidaDano = salidaResult.rows[0];
    }

    const devolucionResult = await client.query(
      `INSERT INTO devoluciones
        (numero_devolucion, id_salida_venta, id_almacen, id_usuario, id_salida_dano, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        numero_devolucion,
        id_salida_venta,
        venta.id_almacen,
        id_usuario,
        salidaDano?.id_salida || null,
        observaciones,
      ],
    );
    const devolucion = devolucionResult.rows[0];

    const pendientePorLinea = new Map(
      lineasVenta.map((linea) => [linea.id_detalle_salida, linea.cantidad_disponible]),
    );
    let totalApto = 0;
    let totalNoApto = 0;

    for (const solicitud of lineasSolicitadas) {
      let restante = solicitud.cantidad;

      // Reparte la cantidad entre los lotes en que se vendió el producto.
      for (const lineaVenta of lineasVenta) {
        if (restante === 0) break;
        if (lineaVenta.id_producto !== solicitud.id_producto) continue;
        const pendiente = pendientePorLinea.get(lineaVenta.id_detalle_salida);
        if (pendiente <= 0) continue;

        const cantidad = Math.min(pendiente, restante);
        pendientePorLinea.set(lineaVenta.id_detalle_salida, pendiente - cantidad);
        restante -= cantidad;

        const loteResult = await client.query(
          `SELECT id_lote, numero_lote, cantidad_actual, estado, fecha_vencimiento,
                  (fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= CURRENT_DATE) AS vencido
           FROM lotes_productos
           WHERE id_lote = $1
           FOR UPDATE`,
          [lineaVenta.id_lote],
        );
        const lote = loteResult.rows[0];
        if (solicitud.estado_producto === "APTO" && lote.vencido) {
          throw new ApiError(
            400,
            `El lote ${lote.numero_lote} de ${lineaVenta.producto} está vencido; regístrelo como no apto`,
          );
        }

        let stockResult = await client.query(
          `SELECT id_stock, cantidad FROM stock
           WHERE id_producto = $1 AND id_almacen = $2
           FOR UPDATE`,
          [solicitud.id_producto, venta.id_almacen],
        );
        if (!stockResult.rowCount) {
          stockResult = await client.query(
            `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
             VALUES ($1, $2, 0, 0)
             RETURNING id_stock, cantidad`,
            [solicitud.id_producto, venta.id_almacen],
          );
        }
        const stock = stockResult.rows[0];
        const stockAnterior = Number(stock.cantidad);
        const stockConDevolucion = stockAnterior + cantidad;

        // Reingreso al lote vendido; un lote agotado vuelve a estar disponible.
        const loteConDevolucion = Number(lote.cantidad_actual) + cantidad;
        await client.query(
          `UPDATE lotes_productos
           SET cantidad_actual = $1,
               estado = CASE
                 WHEN estado = 'AGOTADO' AND $3::boolean THEN 'VENCIDO'
                 WHEN estado = 'AGOTADO' THEN 'DISPONIBLE'
                 ELSE estado
               END
           WHERE id_lote = $2`,
          [loteConDevolucion, lote.id_lote, lote.vencido],
        );

        const movimientoResult = await client.query(
          `INSERT INTO movimientos_inventario
            (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento,
             cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
           VALUES ($1, $2, $3, $4, 'DEVOLUCION', $5, $6, $7, $8, $9)
           RETURNING id_movimiento`,
          [
            solicitud.id_producto,
            venta.id_almacen,
            lote.id_lote,
            id_usuario,
            cantidad,
            stockAnterior,
            stockConDevolucion,
            numero_devolucion,
            `Devolución de cliente (${solicitud.estado_producto === "APTO" ? "apto" : "no apto"}) de la venta ${referenciaVenta}`,
          ],
        );

        let stockFinal = stockConDevolucion;
        let idMovimientoDano = null;

        if (solicitud.estado_producto === "NO_APTO") {
          // Lo no apto sale de inmediato como daño: el stock disponible no aumenta.
          await client.query(
            `UPDATE lotes_productos
             SET cantidad_actual = $1,
                 estado = CASE WHEN $1::numeric = 0::numeric THEN 'AGOTADO' ELSE estado END
             WHERE id_lote = $2`,
            [loteConDevolucion - cantidad, lote.id_lote],
          );

          const precio = Number(lineaVenta.precio_unitario || 0);
          await client.query(
            `INSERT INTO detalle_salidas
              (id_salida, id_producto, id_lote, cantidad, precio_unitario, valor_total, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              salidaDano.id_salida,
              solicitud.id_producto,
              lote.id_lote,
              cantidad,
              precio,
              precio * cantidad,
              solicitud.motivo,
            ],
          );

          stockFinal = stockConDevolucion - cantidad;
          const danoResult = await client.query(
            `INSERT INTO movimientos_inventario
              (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento,
               cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
             VALUES ($1, $2, $3, $4, 'SALIDA_DANO', $5, $6, $7, $8, $9)
             RETURNING id_movimiento`,
            [
              solicitud.id_producto,
              venta.id_almacen,
              lote.id_lote,
              id_usuario,
              cantidad,
              stockConDevolucion,
              stockFinal,
              salidaDano.numero_salida,
              `Devolución no apta ${numero_devolucion}: ${solicitud.motivo}`,
            ],
          );
          idMovimientoDano = danoResult.rows[0].id_movimiento;
          totalNoApto += cantidad;
        } else {
          totalApto += cantidad;
        }

        if (stockFinal !== stockAnterior) {
          await client.query(
            `UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id_stock = $2`,
            [stockFinal, stock.id_stock],
          );
        }

        await client.query(
          `INSERT INTO detalle_devoluciones
            (id_devolucion, id_detalle_salida, id_producto, id_lote, cantidad,
             estado_producto, motivo, id_movimiento, id_movimiento_dano)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            devolucion.id_devolucion,
            lineaVenta.id_detalle_salida,
            solicitud.id_producto,
            lote.id_lote,
            cantidad,
            solicitud.estado_producto,
            solicitud.motivo,
            movimientoResult.rows[0].id_movimiento,
            idMovimientoDano,
          ],
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      message:
        totalNoApto > 0
          ? `Devolución registrada: ${totalApto} unidad(es) reingresaron al stock y ${totalNoApto} se registraron como daño`
          : `Devolución registrada: ${totalApto} unidad(es) reingresaron al stock`,
      data: {
        ...devolucion,
        numero_salida_dano: salidaDano?.numero_salida || null,
        total_apto: totalApto,
        total_no_apto: totalNoApto,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la devolución:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
});

/**
 * GET /api/devoluciones
 * Historial paginado de devoluciones.
 */
const listarDevoluciones = asyncHandler(async (req, res) => {
  const { id_almacen, fecha_desde, fecha_hasta, search } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (id_almacen) {
    condiciones.push(`d.id_almacen = $${i++}`);
    valores.push(id_almacen);
  }
  if (fecha_desde) {
    condiciones.push(`d.fecha_devolucion >= $${i++}::date`);
    valores.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push(`d.fecha_devolucion < ($${i++}::date + 1)`);
    valores.push(fecha_hasta);
  }
  if (search) {
    condiciones.push(
      `(d.numero_devolucion ILIKE $${i} OR v.numero_salida ILIKE $${i} OR v.referencia_externa ILIKE $${i})`,
    );
    valores.push(`%${search}%`);
    i++;
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const fromSql = `
    FROM devoluciones d
    INNER JOIN salidas_inventario v ON v.id_salida = d.id_salida_venta
    INNER JOIN almacenes a ON a.id_almacen = d.id_almacen
    INNER JOIN usuarios u ON u.id_usuario = d.id_usuario
    LEFT JOIN salidas_inventario sd ON sd.id_salida = d.id_salida_dano`;

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         d.*,
         v.numero_salida AS numero_venta,
         v.referencia_externa AS referencia_venta,
         a.nombre AS almacen,
         u.nombre_completo AS usuario_registra,
         sd.numero_salida AS numero_salida_dano,
         (SELECT COALESCE(SUM(cantidad), 0)::int FROM detalle_devoluciones dd
           WHERE dd.id_devolucion = d.id_devolucion AND dd.estado_producto = 'APTO') AS total_apto,
         (SELECT COALESCE(SUM(cantidad), 0)::int FROM detalle_devoluciones dd
           WHERE dd.id_devolucion = d.id_devolucion AND dd.estado_producto = 'NO_APTO') AS total_no_apto
       ${fromSql}
       ${whereSql}
       ORDER BY d.fecha_devolucion DESC, d.id_devolucion DESC
       LIMIT $${i++} OFFSET $${i++}`,
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
 * GET /api/devoluciones/:id
 */
const obtenerDevolucion = asyncHandler(async (req, res) => {
  const id = enteroPositivo(req.params.id);
  if (!id) throw new ApiError(400, "Devolución no válida");

  const cabecera = await db.query(
    `SELECT
       d.*,
       v.numero_salida AS numero_venta,
       v.referencia_externa AS referencia_venta,
       v.fecha_salida AS fecha_venta,
       a.nombre AS almacen,
       u.nombre_completo AS usuario_registra,
       sd.numero_salida AS numero_salida_dano
     FROM devoluciones d
     INNER JOIN salidas_inventario v ON v.id_salida = d.id_salida_venta
     INNER JOIN almacenes a ON a.id_almacen = d.id_almacen
     INNER JOIN usuarios u ON u.id_usuario = d.id_usuario
     LEFT JOIN salidas_inventario sd ON sd.id_salida = d.id_salida_dano
     WHERE d.id_devolucion = $1`,
    [id],
  );
  if (!cabecera.rowCount) throw new ApiError(404, "Devolución no encontrada");

  const detalles = await db.query(
    `SELECT
       dd.*,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       um.abreviatura AS unidad,
       lp.numero_lote
     FROM detalle_devoluciones dd
     INNER JOIN productos p ON p.id_producto = dd.id_producto
     LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN lotes_productos lp ON lp.id_lote = dd.id_lote
     WHERE dd.id_devolucion = $1
     ORDER BY dd.id_detalle_devolucion`,
    [id],
  );

  res.json({ ok: true, data: { ...cabecera.rows[0], detalles: detalles.rows } });
});

module.exports = {
  buscarVentas,
  obtenerVentaDevolvible,
  crearDevolucion,
  listarDevoluciones,
  obtenerDevolucion,
};
