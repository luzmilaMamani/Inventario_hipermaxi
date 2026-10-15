const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

async function generarNumeroSalida(client, tipo) {
  const prefijo = tipo === "PERDIDA" ? "PER" : "SAL";
  const yearResult = await client.query(
    "SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year",
  );
  const year = yearResult.rows[0].year;
  const claveBloqueo = `${prefijo}-${year}`;

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    claveBloqueo,
  ]);

  const result = await client.query(
    `SELECT COALESCE(MAX(SPLIT_PART(numero_salida, '-', 3)::int), 0)::int AS total
     FROM salidas_inventario
     WHERE numero_salida ~ $1`,
    [`^${prefijo}-${year}-[0-9]+$`],
  );

  const siguiente = result.rows[0].total + 1;
  return `${prefijo}-${year}-${String(siguiente).padStart(4, "0")}`;
}

const crearSalida = asyncHandler(async (req, res) => {
  const {
    id_almacen,
    tipo_salida = "VENTA",
    subtipo_perdida = null,
    observaciones = null,
    referencia_externa = null,
    detalles = [],
  } = req.body;

  const id_usuario = req.user.id_usuario;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const almacenResult = await client.query(
      "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
      [id_almacen],
    );
    if (!almacenResult.rowCount) {
      throw new ApiError(400, "El almacén no existe o está inactivo");
    }

    const idsProductos = [...new Set(detalles.map((detalle) => Number(detalle.id_producto)))];
    const productosResult = await client.query(
      "SELECT id_producto FROM productos WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'",
      [idsProductos],
    );
    if (productosResult.rowCount !== idsProductos.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    const numero_salida = await generarNumeroSalida(client, tipo_salida);

    const salidaResult = await client.query(
      `INSERT INTO salidas_inventario
        (numero_salida, id_almacen, id_usuario, tipo_salida, subtipo_perdida,
         referencia_externa, observaciones, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADA')
       RETURNING *`,
      [
        numero_salida,
        id_almacen,
        id_usuario,
        tipo_salida,
        subtipo_perdida,
        referencia_externa,
        observaciones,
      ],
    );
    const salida = salidaResult.rows[0];

    const detallesInsertados = [];
    for (const d of detalles) {
      const cantidad = String(d.cantidad);
      const id_producto = Number(d.id_producto);
      const id_lote =
        d.id_lote === undefined || d.id_lote === null || d.id_lote === ""
          ? null
          : Number(d.id_lote);

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
          `No hay stock registrado para el producto ${id_producto} en este almacén`,
        );
      }

      const stockActual = stockResult.rows[0];
      const disponibilidadResult = await client.query(
        `SELECT
           $1::numeric > $2::numeric - $3::numeric AS insuficiente,
           ($2::numeric - $3::numeric)::text AS disponible`,
        [
          cantidad,
          stockActual.cantidad,
          stockActual.cantidad_reservada || 0,
        ],
      );
      const { insuficiente, disponible } = disponibilidadResult.rows[0];

      if (insuficiente) {
        throw new ApiError(
          400,
          `Stock insuficiente. Disponible: ${disponible}, solicitado: ${cantidad}`,
        );
      }

      const lotesResult = id_lote
        ? await client.query(
            `SELECT id_lote, cantidad_actual
             FROM lotes_productos
             WHERE id_lote = $1
               AND id_producto = $2
               AND id_almacen = $3
               AND cantidad_actual > 0
               AND ($4 = 'PERDIDA' OR estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER'))
             FOR UPDATE`,
            [id_lote, id_producto, id_almacen, tipo_salida],
          )
        : await client.query(
            `SELECT id_lote, cantidad_actual
             FROM lotes_productos
             WHERE id_producto = $1
               AND id_almacen = $2
               AND cantidad_actual > 0
               AND ($3 = 'PERDIDA' OR estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER'))
             ORDER BY fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id_lote ASC
             FOR UPDATE`,
            [id_producto, id_almacen, tipo_salida],
          );

      let cantidadPendiente = cantidad;
      let stockEnProceso = String(stockActual.cantidad);
      for (const lote of lotesResult.rows) {
        const asignacionResult = await client.query(
          `SELECT
             LEAST($1::numeric, $2::numeric)::text AS cantidad_asignada,
             GREATEST($1::numeric - $2::numeric, 0)::text AS cantidad_pendiente,
             ($3::numeric - LEAST($1::numeric, $2::numeric))::text AS stock_nuevo`,
          [cantidadPendiente, lote.cantidad_actual, stockEnProceso],
        );
        const {
          cantidad_asignada: cantidadAsignada,
          cantidad_pendiente: cantidadRestante,
          stock_nuevo: stockNuevo,
        } = asignacionResult.rows[0];
        if (Number(cantidadAsignada) <= 0) break;

        const detalleResult = await client.query(
          `INSERT INTO detalle_salidas
            (id_salida, id_producto, id_lote, cantidad, observaciones)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            salida.id_salida,
            id_producto,
            lote.id_lote,
            cantidadAsignada,
            d.observaciones || null,
          ],
        );
        detallesInsertados.push(detalleResult.rows[0]);

        await client.query(
          `UPDATE lotes_productos
           SET cantidad_actual = cantidad_actual - $1,
               estado = CASE WHEN cantidad_actual - $1 = 0 THEN 'AGOTADO' ELSE estado END
           WHERE id_lote = $2`,
          [cantidadAsignada, lote.id_lote],
        );

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
            tipo_salida === "PERDIDA" ? "SALIDA" : tipo_salida,
            cantidadAsignada,
            stockEnProceso,
            stockNuevo,
            numero_salida,
            observaciones,
          ],
        );

        stockEnProceso = stockNuevo;
        cantidadPendiente = cantidadRestante;
      }

      if (cantidadPendiente > 0) {
        throw new ApiError(
          400,
          `Stock por lote insuficiente para el producto ${id_producto}`,
        );
      }

      await client.query(
        `UPDATE stock
         SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [stockEnProceso, stockActual.id_stock],
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      message:
        tipo_salida === "PERDIDA"
          ? "Pérdida registrada y stock actualizado"
          : "Salida registrada exitosamente",
      data: {
        ...salida,
        detalles: detallesInsertados,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la salida de inventario:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
});

const listarSalidas = asyncHandler(async (req, res) => {
  const { tipo_salida, id_almacen, fecha_desde, fecha_hasta, search } =
    req.query;

  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];
  let i = 1;

  if (tipo_salida) {
    condiciones.push(`s.tipo_salida = $${i++}`);
    valores.push(tipo_salida);
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
         (SELECT COALESCE(SUM(valor_total), 0) FROM detalle_salidas ds WHERE ds.id_salida = s.id_salida) AS valor_total
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
       p.codigo AS producto_codigo,
       p.nombre AS producto,
       c.nombre AS categoria,
       m.nombre AS marca,
       um.abreviatura AS unidad
     FROM detalle_salidas ds
     INNER JOIN productos p ON p.id_producto = ds.id_producto
     INNER JOIN categorias c ON c.id_categoria = p.id_categoria
     LEFT JOIN marcas m ON m.id_marca = p.id_marca
     INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     WHERE ds.id_salida = $1`,
    [id],
  );

  res.json({
    ok: true,
    data: {
      ...cabecera.rows[0],
      detalles: detalles.rows,
    },
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
      `SELECT * FROM vw_perdidas ${whereSql}
       ORDER BY fecha_salida DESC`,
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

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
  });
});

module.exports = {
  crearSalida,
  listarSalidas,
  obtenerSalida,
  reportePerdidas,
};
