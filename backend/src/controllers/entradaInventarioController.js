const { randomBytes } = require("node:crypto");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  return (
    !Number.isNaN(fechaParseada.getTime()) &&
    fechaParseada.toISOString().slice(0, 10) === fecha
  );
}

const registrarRecepcion = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }

  const {
    id_almacen,
    proveedor,
    fecha_entrada,
    referencia_externa,
    observaciones,
    detalles,
  } = req.body;
  const idAlmacen = Number(id_almacen);
  const nombreProveedor =
    typeof proveedor === "string" ? proveedor.trim() : "";

  if (
    typeof id_almacen === "boolean" ||
    !Number.isSafeInteger(idAlmacen) ||
    idAlmacen <= 0
  ) {
    throw new ApiError(400, "Debe seleccionar un almacén válido");
  }
  if (!nombreProveedor) {
    throw new ApiError(400, "El proveedor es obligatorio");
  }
  if (!esFechaValida(fecha_entrada)) {
    throw new ApiError(400, "La fecha de recepción no es válida");
  }
  if (nombreProveedor.length > 150) {
    throw new ApiError(400, "El nombre del proveedor no puede superar 150 caracteres");
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    throw new ApiError(400, "La recepción debe incluir entre 1 y 100 productos");
  }

  // ⚠️ NUEVO (HIP-32): Evitar procesar dos veces la misma recepción
  const refLimpia = String(referencia_externa || "").trim();
  if (refLimpia) {
    const refExiste = await db.query(
      "SELECT id_entrada FROM entradas_inventario WHERE referencia_externa = $1",
      [refLimpia]
    );
    if (refExiste.rowCount > 0) {
      throw new ApiError(400, "Esta recepción ya fue procesada anteriormente (referencia duplicada)");
    }
  }

  const productosIncluidos = new Set();
  const lineas = detalles.map((detalle, indice) => {
    if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) {
      throw new ApiError(400, `El detalle de la línea ${indice + 1} no es válido`);
    }

    const idProducto = Number(detalle.id_producto);
    const cantidadSolicitada = Number(detalle.cantidad_solicitada);
    const cantidadRecibida = Number(detalle.cantidad_recibida);
    const idLote =
      detalle.id_lote === undefined || detalle.id_lote === null || detalle.id_lote === ""
        ? null
        : Number(detalle.id_lote);

    if (
      typeof detalle.id_producto === "boolean" ||
      !Number.isSafeInteger(idProducto) ||
      idProducto <= 0
    ) {
      throw new ApiError(400, `El producto de la línea ${indice + 1} no es válido`);
    }
    if (
      typeof detalle.cantidad_solicitada === "boolean" ||
      !Number.isSafeInteger(cantidadSolicitada) ||
      cantidadSolicitada <= 0
    ) {
      throw new ApiError(400, `La cantidad esperada de la línea ${indice + 1} debe ser un entero mayor a cero`);
    }
    if (
      typeof detalle.cantidad_recibida === "boolean" ||
      !Number.isSafeInteger(cantidadRecibida) ||
      cantidadRecibida <= 0
    ) {
      throw new ApiError(400, `La cantidad recibida de la línea ${indice + 1} debe ser un entero mayor a cero`);
    }
    if (productosIncluidos.has(idProducto)) {
      throw new ApiError(400, `El producto de la línea ${indice + 1} está repetido`);
    }
    productosIncluidos.add(idProducto);
    if (
      idLote !== null &&
      (typeof detalle.id_lote === "boolean" ||
        !Number.isSafeInteger(idLote) ||
        idLote <= 0)
    ) {
      throw new ApiError(400, `El lote de la línea ${indice + 1} no es válido`);
    }
    const fechaVencimiento =
      String(detalle.fecha_vencimiento || "").trim() || null;
    if (fechaVencimiento && !esFechaValida(fechaVencimiento)) {
      throw new ApiError(
        400,
        `La fecha de vencimiento de la línea ${indice + 1} no es válida`,
      );
    }

    return {
      id_producto: idProducto,
      cantidad_solicitada: cantidadSolicitada,
      cantidad_recibida: cantidadRecibida,
      diferencia: cantidadRecibida - cantidadSolicitada,
      id_lote: idLote,
      numero_lote: String(detalle.numero_lote || "").trim() || null,
      fecha_vencimiento: fechaVencimiento,
      observaciones: String(detalle.observaciones || "").trim() || null,
    };
  });

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");

    const almacenResult = await cliente.query(
      "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
      [idAlmacen],
    );
    if (!almacenResult.rowCount) {
      throw new ApiError(400, "El almacén no existe o está inactivo");
    }

    const idsProductos = [...new Set(lineas.map((linea) => linea.id_producto))];
    const productosResult = await cliente.query(
      "SELECT id_producto FROM productos WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'",
      [idsProductos],
    );
    if (productosResult.rowCount !== idsProductos.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    const numeroEntrada = `ENT-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const entradaResult = await cliente.query(
      `INSERT INTO entradas_inventario
         (numero_entrada, id_almacen, id_usuario, fecha_entrada, origen,
          referencia_externa, estado, observaciones)
       VALUES ($1, $2, $3, $4::date::timestamp, $5, $6, 'CONFIRMADA', $7)
       RETURNING id_entrada, numero_entrada, fecha_entrada, estado`,
      [
        numeroEntrada,
        idAlmacen,
        req.user.id_usuario,
        fecha_entrada,
        nombreProveedor,
        refLimpia || null,
        String(observaciones || "").trim() || null,
      ],
    );
    const entrada = entradaResult.rows[0];

    const detallesRegistrados = [];
    for (const [indice, linea] of lineas.entries()) {
      let lote;
      if (linea.id_lote) {
        const loteResult = await cliente.query(
          `SELECT id_lote, numero_lote
           FROM lotes_productos
           WHERE id_lote = $1 AND id_producto = $2 AND id_almacen = $3
           FOR UPDATE`,
          [linea.id_lote, linea.id_producto, idAlmacen],
        );
        if (!loteResult.rowCount) {
          throw new ApiError(
            400,
            `El lote de la línea ${indice + 1} no corresponde al producto y almacén`,
          );
        }
        lote = loteResult.rows[0];
        await cliente.query(
          `UPDATE lotes_productos
           SET cantidad_inicial = cantidad_inicial + $1,
               cantidad_actual = cantidad_actual + $1,
               estado = CASE WHEN estado = 'AGOTADO' THEN 'DISPONIBLE' ELSE estado END
           WHERE id_lote = $2`,
          [linea.cantidad_recibida, lote.id_lote],
        );
      } else {
        const numeroLote =
          linea.numero_lote || `${entrada.numero_entrada}-${indice + 1}`;
        const loteResult = await cliente.query(
          `INSERT INTO lotes_productos
             (id_producto, id_almacen, numero_lote, fecha_ingreso,
              fecha_vencimiento, cantidad_inicial, cantidad_actual)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $5)
           RETURNING id_lote, numero_lote`,
          [
            linea.id_producto,
            idAlmacen,
            numeroLote,
            linea.fecha_vencimiento,
            linea.cantidad_recibida,
          ],
        );
        lote = loteResult.rows[0];
      }

      await cliente.query(
        `INSERT INTO detalle_entradas
           (id_entrada, id_producto, id_lote, cantidad_solicitada,
            cantidad_recibida, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entrada.id_entrada,
          linea.id_producto,
          lote.id_lote,
          linea.cantidad_solicitada,
          linea.cantidad_recibida,
          linea.observaciones,
        ],
      );
      detallesRegistrados.push({
        ...linea,
        id_lote: lote.id_lote,
        numero_lote: lote.numero_lote,
      });

      const stockResult = await cliente.query(
        `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (id_producto, id_almacen)
         DO UPDATE SET
           cantidad = stock.cantidad + EXCLUDED.cantidad,
           fecha_actualizacion = CURRENT_TIMESTAMP
         RETURNING cantidad, cantidad - $3::numeric AS stock_anterior`,
        [linea.id_producto, idAlmacen, linea.cantidad_recibida],
      );
      const { cantidad: stockNuevo, stock_anterior: stockAnterior } =
        stockResult.rows[0];

      await cliente.query(
        `INSERT INTO movimientos_inventario
           (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento, cantidad,
            stock_anterior, stock_nuevo, referencia, observaciones)
         VALUES ($1, $2, $3, $4, 'ENTRADA', $5, $6, $7, $8, $9)`,
        [
          linea.id_producto,
          idAlmacen,
          lote.id_lote,
          req.user.id_usuario,
          linea.cantidad_recibida,
          stockAnterior,
          stockNuevo,
          entrada.numero_entrada,
          linea.observaciones || `Recepción del proveedor ${nombreProveedor}`,
        ],
      );

      if (linea.diferencia !== 0) {
        const tipo = linea.diferencia < 0 ? "FALTANTE" : "SOBRANTE";
        await cliente.query(
          `INSERT INTO diferencias_recepcion
            (id_entrada, id_producto, tipo, cantidad, observaciones, id_usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            entrada.id_entrada,
            linea.id_producto,
            tipo,
            Math.abs(linea.diferencia),
            `Esperado: ${linea.cantidad_solicitada}; recibido: ${linea.cantidad_recibida}. ${linea.observaciones || ""}`.trim(),
            req.user.id_usuario,
          ],
        );
      }

      detallesRegistrados[detallesRegistrados.length - 1].estado_verificacion =
        linea.diferencia === 0 ? "CONFORME" : "CON_DIFERENCIA";
    }

    await cliente.query("COMMIT");
    const hayDiferencias = detallesRegistrados.some(
      (detalle) => detalle.estado_verificacion === "CON_DIFERENCIA",
    );
    res.status(201).json({
      ok: true,
      message: "Recepción registrada y stock actualizado",
      resultado_verificacion: hayDiferencias ? "CON_DIFERENCIA" : "CONFORME",
      data: {
        ...entrada,
        proveedor: nombreProveedor,
        detalles: detallesRegistrados,
      },
    });
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la recepción de mercadería:", rollbackError);
    }
    throw error;
  } finally {
    cliente.release();
  }
});

const listarRecepciones = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];

  if (req.query.id_almacen) {
    const idAlmacen = Number(req.query.id_almacen);
    if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
      throw new ApiError(400, "El almacén no es válido");
    }
    values.push(idAlmacen);
    conditions.push(`e.id_almacen = $${values.length}`);
  }

  for (const [parameter, operator] of [
    ["fecha_desde", ">="],
    ["fecha_hasta", "<"],
  ]) {
    const date = req.query[parameter];
    if (!date) continue;
    if (!esFechaValida(date)) {
      throw new ApiError(400, `La fecha ${parameter} no es válida`);
    }
    values.push(date);
    const expression =
      operator === "<" ? `$${values.length}::date + INTERVAL '1 day'` : `$${values.length}::date`;
    conditions.push(`e.fecha_entrada ${operator} ${expression}`);
  }

  if (
    req.query.fecha_desde &&
    req.query.fecha_hasta &&
    req.query.fecha_desde > req.query.fecha_hasta
  ) {
    throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitParam = values.length + 1;
  const offsetParam = values.length + 2;
  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT e.id_entrada, e.numero_entrada, e.fecha_entrada, e.origen AS proveedor,
              e.referencia_externa, e.estado, a.id_almacen, a.codigo AS almacen_codigo,
              a.nombre AS almacen, u.nombre_completo AS usuario,
              COUNT(de.id_detalle_entrada)::int AS cantidad_productos,
              COALESCE(SUM(de.cantidad_recibida), 0) AS unidades_recibidas
       FROM entradas_inventario e
       INNER JOIN almacenes a ON a.id_almacen = e.id_almacen
       LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
       LEFT JOIN detalle_entradas de ON de.id_entrada = e.id_entrada
       ${whereSql}
       GROUP BY e.id_entrada, a.id_almacen, u.id_usuario
       ORDER BY e.fecha_entrada DESC, e.id_entrada DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM entradas_inventario e ${whereSql}`,
      values,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const obtenerRecepcion = asyncHandler(async (req, res) => {
  const idEntrada = Number(req.params.id);
  if (!Number.isSafeInteger(idEntrada) || idEntrada <= 0) {
    throw new ApiError(400, "El ID de la recepción no es válido");
  }
  const entradaResult = await db.query(
    `SELECT e.*, a.codigo AS almacen_codigo, a.nombre AS almacen,
            u.nombre_completo AS usuario
     FROM entradas_inventario e
     INNER JOIN almacenes a ON a.id_almacen = e.id_almacen
     LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
     WHERE e.id_entrada = $1`,
    [idEntrada],
  );
  if (!entradaResult.rowCount) throw new ApiError(404, "Recepción no encontrada");

  const detallesResult = await db.query(
    `SELECT de.*, p.codigo AS producto_codigo, p.nombre AS producto,
            lp.numero_lote
     FROM detalle_entradas de
     INNER JOIN productos p ON p.id_producto = de.id_producto
     LEFT JOIN lotes_productos lp ON lp.id_lote = de.id_lote
     WHERE de.id_entrada = $1
     ORDER BY de.id_detalle_entrada`,
    [idEntrada],
  );
  const diferenciasResult = await db.query(
    `SELECT d.*, p.codigo AS producto_codigo, p.nombre AS producto,
            u.nombre_completo AS usuario
     FROM diferencias_recepcion d
     INNER JOIN productos p ON p.id_producto = d.id_producto
     LEFT JOIN usuarios u ON u.id_usuario = d.id_usuario
     WHERE d.id_entrada = $1
     ORDER BY d.fecha_registro, d.id_diferencia`,
    [idEntrada],
  );

  res.json({
    ok: true,
    data: {
      ...entradaResult.rows[0],
      detalles: detallesResult.rows,
      diferencias: diferenciasResult.rows,
    },
  });
});

module.exports = { registrarRecepcion, listarRecepciones, obtenerRecepcion };