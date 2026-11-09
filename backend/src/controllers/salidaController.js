const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { obtenerLotesVigentes, planificarFefo, asignarLotes } = require("../services/lotesFefo");
const { asignarLotesVencidos, obtenerCantidadNoDisponible } = require("../services/lotesVencidos");

async function generarNumeroSalida(client, motivo) {
  let prefijo = "SAL";
  if (motivo === "PERDIDA") prefijo = "PER";
  else if (motivo === "DANO") prefijo = "DAN";
  else if (motivo === "VENCIMIENTO") prefijo = "VEN";

  const year = new Date().getFullYear();

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), $2)",
    [motivo, year],
  );

  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM salidas_inventario
     WHERE motivo = $1
       AND fecha_salida >= $2
       AND fecha_salida < $3`,
    [motivo, `${year}-01-01 00:00:00`, `${year + 1}-01-01 00:00:00`],
  );

  const siguiente = result.rows[0].total + 1;
  return `${prefijo}-${year}-${String(siguiente).padStart(4, "0")}`;
}

const crearSalida = asyncHandler(async (req, res) => {
  const {
    id_almacen,
    motivo = "VENTA",
    subtipo_perdida = null,
    observaciones = null,
    referencia_externa = null,
    detalles = [],
  } = req.body;

  const id_usuario = req.user.id_usuario;

  const alm = await db.query(
    "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
    [id_almacen],
  );
  if (!alm.rowCount) {
    throw new ApiError(400, "El almacén no existe o está inactivo");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const idsProductos = [...new Set(detalles.map((d) => Number(d.id_producto)))];
    const productosResult = await client.query(
      "SELECT id_producto FROM productos WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'",
      [idsProductos],
    );
    if (productosResult.rowCount !== idsProductos.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    const numero_salida = await generarNumeroSalida(client, motivo);

    const salidaResult = await client.query(
      `INSERT INTO salidas_inventario
        (numero_salida, id_almacen, id_usuario, motivo, subtipo_perdida,
         referencia_externa, observaciones, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADA')
       RETURNING *`,
      [
        numero_salida,
        id_almacen,
        id_usuario,
        motivo,
        subtipo_perdida,
        referencia_externa,
        observaciones,
      ],
    );
    const salida = salidaResult.rows[0];

    const detallesInsertados = [];
    for (const d of detalles) {
      const cantidad = Number(d.cantidad);
      const id_producto = Number(d.id_producto);

      let asignaciones;

      if (motivo === "VENCIMIENTO") {
        // RF43/RF27: solo se dan de baja lotes vencidos (el indicado o, si no se
        // indica, los vencidos más antiguos).
        asignaciones = await asignarLotesVencidos(client, {
          id_producto,
          id_almacen,
          cantidad,
          id_lote: d.id_lote,
        });
      } else {
        // RF49: lote(s) vigentes por vencimiento más próximo (FEFO).
        asignaciones = await asignarLotes(client, {
          id_producto,
          id_almacen,
          cantidad,
          id_lote: d.id_lote,
          justificacion_lote: d.justificacion_lote,
        });
      }

      const stockResult = await client.query(
        `SELECT id_stock, cantidad, cantidad_reservada
         FROM stock
         WHERE id_producto = $1 AND id_almacen = $2
         FOR UPDATE`,
        [id_producto, id_almacen],
      );

      if (!stockResult.rowCount) {
        throw new ApiError(
          400,
          `No hay stock registrado para el producto ${id_producto}`,
        );
      }

      const stockActual = stockResult.rows[0];
      // RF43: lo vencido no es stock disponible. Una baja por vencimiento sale
      // justamente de esa parte del stock físico, pero sin dejar descubierto lo
      // reservado (transferencias en curso).
      const reservada = Number(stockActual.cantidad_reservada || 0);
      if (motivo === "VENCIMIENTO" && cantidad > Number(stockActual.cantidad) - reservada) {
        throw new ApiError(
          400,
          `No se puede dar de baja ${cantidad} unidades del producto ${id_producto}: hay ${reservada} unidades reservadas y el stock quedaría por debajo de lo reservado. Libere o cancele las reservas primero.`,
        );
      }
      const disponible =
        motivo === "VENCIMIENTO"
          ? Number(stockActual.cantidad) - reservada
          : Number(stockActual.cantidad) -
            reservada -
            (await obtenerCantidadNoDisponible(client, id_producto, id_almacen));

      if (cantidad > disponible) {
        throw new ApiError(
          400,
          `Stock insuficiente. Disponible: ${disponible}, solicitado: ${cantidad}`,
        );
      }

      const precioResult = await client.query(
        "SELECT COALESCE(precio, 0) AS precio FROM productos WHERE id_producto = $1",
        [id_producto],
      );
      const precio = Number(precioResult.rows[0]?.precio || 0);

      let tipoMovimiento = "SALIDA";
      if (motivo === "PERDIDA") tipoMovimiento = "SALIDA_PERDIDA";
      else if (motivo === "DANO") tipoMovimiento = "SALIDA_DANO";
      else if (motivo === "VENCIMIENTO") tipoMovimiento = "SALIDA_VENCIMIENTO";

      // Una línea de detalle y un movimiento por cada lote usado.
      let stockCorriente = Number(stockActual.cantidad);
      for (const asignacion of asignaciones) {
        const { lote } = asignacion;
        const cantidadLote = asignacion.cantidad;

        const detalleResult = await client.query(
          `INSERT INTO detalle_salidas
            (id_salida, id_producto, id_lote, cantidad, precio_unitario, valor_total,
             observaciones, id_lote_sugerido, justificacion_lote)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            salida.id_salida,
            id_producto,
            lote.id_lote,
            cantidadLote,
            precio,
            precio * cantidadLote,
            d.observaciones || null,
            asignacion.id_lote_sugerido,
            asignacion.justificacion_lote,
          ],
        );
        detallesInsertados.push({
          ...detalleResult.rows[0],
          numero_lote: lote.numero_lote,
          fecha_vencimiento: lote.fecha_vencimiento,
        });

        const loteNuevo = Number(lote.cantidad_actual) - cantidadLote;
        await client.query(
          `UPDATE lotes_productos
           SET cantidad_actual = $1,
               estado = CASE
                 WHEN $1::numeric = 0::numeric THEN 'AGOTADO'
                 ELSE estado
               END
           WHERE id_lote = $2`,
          [loteNuevo, lote.id_lote],
        );

        const stockNuevo = stockCorriente - cantidadLote;
        await client.query(
          `INSERT INTO movimientos_inventario
            (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento,
             cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id_producto,
            id_almacen,
            lote.id_lote,
            id_usuario,
            tipoMovimiento,
            cantidadLote,
            stockCorriente,
            stockNuevo,
            numero_salida,
            asignacion.justificacion_lote
              ? `${observaciones ? `${observaciones} | ` : ""}Cambio de lote FEFO: ${asignacion.justificacion_lote}`
              : observaciones,
          ],
        );
        stockCorriente = stockNuevo;
      }

      await client.query(
        `UPDATE stock
         SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [stockCorriente, stockActual.id_stock],
      );
    }

    await client.query("COMMIT");

    let mensaje = "Salida registrada exitosamente";
    if (motivo === "PERDIDA")
      mensaje = "Pérdida registrada y stock actualizado";
    else if (motivo === "DANO") mensaje = "Daño registrado y stock actualizado";
    else if (motivo === "VENCIMIENTO")
      mensaje = "Vencimiento registrado y stock actualizado";

    res.status(201).json({
      ok: true,
      message: mensaje,
      data: { ...salida, detalles: detallesInsertados },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la salida de mercadería:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
});

// RF49: lotes vigentes en orden FEFO y reparto sugerido para una cantidad.
const sugerirLotes = asyncHandler(async (req, res) => {
  const id_producto = Number(req.query.id_producto);
  const id_almacen = Number(req.query.id_almacen);
  const cantidad = req.query.cantidad === undefined ? 0 : Number(req.query.cantidad);

  if (!Number.isSafeInteger(id_producto) || id_producto <= 0) {
    throw new ApiError(400, "Debe indicar un producto válido");
  }
  if (!Number.isSafeInteger(id_almacen) || id_almacen <= 0) {
    throw new ApiError(400, "Debe indicar un almacén válido");
  }
  if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
    throw new ApiError(400, "La cantidad debe ser un número entero mayor o igual a 0");
  }

  const lotes = await obtenerLotesVigentes(db, { id_producto, id_almacen });
  const { asignaciones, faltante } = planificarFefo(lotes, cantidad);

  res.json({
    ok: true,
    data: {
      lotes,
      sugerencia: asignaciones.map((a) => ({
        id_lote: a.lote.id_lote,
        numero_lote: a.lote.numero_lote,
        fecha_vencimiento: a.lote.fecha_vencimiento,
        cantidad: a.cantidad,
      })),
      total_disponible: lotes.reduce((acc, l) => acc + Number(l.cantidad_actual), 0),
      faltante,
    },
  });
});

const listarSalidas = asyncHandler(async (req, res) => {
  const { motivo, id_almacen, fecha_desde, fecha_hasta, search } = req.query;

  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (motivo) {
    condiciones.push(`s.motivo = $${i++}`);
    valores.push(motivo);
  }
  if (id_almacen) {
    condiciones.push(`s.id_almacen = $${i++}`);
    valores.push(id_almacen);
  }
  if (fecha_desde) {
    condiciones.push(`s.fecha_salida >= $${i++}`);
    valores.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push(`s.fecha_salida <= $${i++}`);
    valores.push(fecha_hasta);
  }
  if (search) {
    condiciones.push(
      `(s.numero_salida ILIKE $${i} OR s.observaciones ILIKE $${i})`,
    );
    valores.push(`%${search}%`);
    i++;
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT
         s.*,
         a.codigo AS almacen_codigo,
         a.nombre AS almacen,
         u.nombre_completo AS usuario_registra,
         (SELECT COUNT(*)::int FROM detalle_salidas ds WHERE ds.id_salida = s.id_salida) AS total_items,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM detalle_salidas ds WHERE ds.id_salida = s.id_salida) AS valor_total
       FROM salidas_inventario s
       INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
       INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
       ${whereSql}
       ORDER BY s.fecha_salida DESC, s.id_salida DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM salidas_inventario s ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const obtenerSalida = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const cabecera = await db.query(
    `SELECT
       s.*,
       a.codigo AS almacen_codigo,
       a.nombre AS almacen,
       u.nombre_completo AS usuario_registra
     FROM salidas_inventario s
     INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
     INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
     WHERE s.id_salida = $1`,
    [id],
  );

  if (!cabecera.rowCount) {
    throw new ApiError(404, "Salida no encontrada");
  }

  const detalles = await db.query(
    `SELECT
       ds.*,
       (ds.cantidad * ds.precio_unitario) AS valor_total,
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       c.nombre AS categoria,
       m.nombre AS marca,
       um.abreviatura AS unidad,
       lp.numero_lote,
       TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
       lps.numero_lote AS numero_lote_sugerido
     FROM detalle_salidas ds
     INNER JOIN productos p ON p.id_producto = ds.id_producto
     INNER JOIN categorias c ON c.id_categoria = p.id_categoria
     LEFT JOIN marcas m ON m.id_marca = p.id_marca
     INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN lotes_productos lp ON lp.id_lote = ds.id_lote
     LEFT JOIN lotes_productos lps ON lps.id_lote = ds.id_lote_sugerido
     WHERE ds.id_salida = $1
     ORDER BY ds.id_detalle_salida`,
    [id],
  );

  res.json({
    ok: true,
    data: { ...cabecera.rows[0], detalles: detalles.rows },
  });
});

const reportePerdidas = asyncHandler(async (req, res) => {
  const { fecha_desde, fecha_hasta, id_almacen, subtipo_perdida } = req.query;
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (fecha_desde) {
    condiciones.push(`fecha_salida >= $${i++}`);
    valores.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push(`fecha_salida <= $${i++}`);
    valores.push(fecha_hasta);
  }
  if (id_almacen) {
    condiciones.push(`id_almacen = $${i++}`);
    valores.push(id_almacen);
  }
  if (subtipo_perdida) {
    condiciones.push(`subtipo_perdida = $${i++}`);
    valores.push(subtipo_perdida);
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [detalle, resumen] = await Promise.all([
    db.query(
      `SELECT * FROM vw_perdidas ${whereSql} ORDER BY fecha_salida DESC`,
      valores,
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_registros,
         COUNT(DISTINCT id_salida)::int AS total_salidas,
         COALESCE(SUM(cantidad), 0)::numeric AS total_unidades,
         COALESCE(SUM(valor_total), 0)::numeric AS total_valorizado
       FROM vw_perdidas ${whereSql}`,
      valores,
    ),
  ]);

  res.json({ ok: true, data: detalle.rows, resumen: resumen.rows[0] });
});

const reporteDanos = asyncHandler(async (req, res) => {
  const { fecha_desde, fecha_hasta, id_almacen, subtipo_dano } = req.query;
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (fecha_desde) {
    condiciones.push(`fecha_salida >= $${i++}`);
    valores.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push(`fecha_salida <= $${i++}`);
    valores.push(fecha_hasta);
  }
  if (id_almacen) {
    condiciones.push(`id_almacen = $${i++}`);
    valores.push(id_almacen);
  }
  if (subtipo_dano) {
    condiciones.push(`subtipo_dano = $${i++}`);
    valores.push(subtipo_dano);
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [detalle, resumen] = await Promise.all([
    db.query(
      `SELECT * FROM vw_danos ${whereSql} ORDER BY fecha_salida DESC`,
      valores,
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_registros,
         COUNT(DISTINCT id_salida)::int AS total_salidas,
         COALESCE(SUM(cantidad), 0)::numeric AS total_unidades,
         COALESCE(SUM(valor_total), 0)::numeric AS total_valorizado
       FROM vw_danos ${whereSql}`,
      valores,
    ),
  ]);

  res.json({ ok: true, data: detalle.rows, resumen: resumen.rows[0] });
});

const reporteVencimientos = asyncHandler(async (req, res) => {
  const { fecha_desde, fecha_hasta, id_almacen } = req.query;
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (fecha_desde) {
    condiciones.push(`fecha_salida >= $${i++}`);
    valores.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push(`fecha_salida <= $${i++}`);
    valores.push(fecha_hasta);
  }
  if (id_almacen) {
    condiciones.push(`id_almacen = $${i++}`);
    valores.push(id_almacen);
  }

  const whereSql = condiciones.length
    ? `WHERE ${condiciones.join(" AND ")}`
    : "";

  const [detalle, resumen] = await Promise.all([
    db.query(
      `SELECT * FROM vw_vencimientos ${whereSql} ORDER BY fecha_salida DESC`,
      valores,
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_registros,
         COUNT(DISTINCT id_salida)::int AS total_salidas,
         COALESCE(SUM(cantidad), 0)::numeric AS total_unidades,
         COALESCE(SUM(valor_total), 0)::numeric AS total_valorizado
       FROM vw_vencimientos ${whereSql}`,
      valores,
    ),
  ]);

  res.json({ ok: true, data: detalle.rows, resumen: resumen.rows[0] });
});

module.exports = {
  generarNumeroSalida,
  crearSalida,
  sugerirLotes,
  listarSalidas,
  obtenerSalida,
  reportePerdidas,
  reporteDanos,
  reporteVencimientos,
};
