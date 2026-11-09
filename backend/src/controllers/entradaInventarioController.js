const { readFileSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const {
  evaluarLineaRecepcion,
  resultadoVerificacion,
} = require("../utils/verificacionRecepcion");
const { sumarALote } = require("../services/lotesMovimientos");

let columnasVerificacionListas = false;

async function asegurarColumnasVerificacion() {
  if (columnasVerificacionListas) return;

  const verificacion = readFileSync(
    path.join(__dirname, "../../sql/rf20_verificacion_recepcion.sql"),
    "utf8",
  );
  const confirmacion = readFileSync(
    path.join(__dirname, "../../sql/rf22_confirmar_recepcion.sql"),
    "utf8",
  );
  await db.query(verificacion);
  await db.query(confirmacion);
  columnasVerificacionListas = true;
}

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

function fechaLocalHoy() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function formatoFechaLote(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }
  return String(fecha).slice(0, 10);
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

  const hoy = fechaLocalHoy();
  const productosIncluidos = new Set();
  const lineas = detalles.map((detalle, indice) => {
    if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) {
      throw new ApiError(400, `El detalle de la línea ${indice + 1} no es válido`);
    }

    const idProducto = Number(detalle.id_producto);
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
    const verificacion = evaluarLineaRecepcion(detalle, indice);
    if (
      !Number.isSafeInteger(verificacion.cantidad_solicitada) ||
      !Number.isSafeInteger(verificacion.cantidad_recibida)
    ) {
      throw new ApiError(
        400,
        `Las cantidades de la línea ${indice + 1} deben ser números enteros mayores a cero`,
      );
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
    // RF40/RF43: un lote que vence hoy ya se considera vencido.
    if (fechaVencimiento && fechaVencimiento <= hoy) {
      throw new ApiError(
        400,
        `La fecha de vencimiento de la línea ${indice + 1} debe ser posterior a hoy; no se puede recibir un producto vencido`,
      );
    }
    const numeroLote = String(detalle.numero_lote || "").trim() || null;
    if (numeroLote && numeroLote.length > 100) {
      throw new ApiError(
        400,
        `El número de lote de la línea ${indice + 1} no puede superar 100 caracteres`,
      );
    }

    return {
      id_producto: idProducto,
      ...verificacion,
      cantidad: verificacion.cantidad_recibida,
      id_lote: idLote,
      numero_lote: numeroLote,
      fecha_vencimiento: fechaVencimiento,
      observaciones: String(detalle.observaciones || "").trim() || null,
    };
  });
  const resultado = resultadoVerificacion(lineas);

  await asegurarColumnasVerificacion();
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
      `SELECT id_producto, controla_vencimiento
       FROM productos
       WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'`,
      [idsProductos],
    );
    if (productosResult.rowCount !== idsProductos.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    // RF40: la fecha de vencimiento solo aplica (y es obligatoria) para
    // productos con controla_vencimiento; en los demás se ignora.
    const controlaVencimiento = new Map(
      productosResult.rows.map((p) => [Number(p.id_producto), p.controla_vencimiento === true]),
    );
    for (const [indice, linea] of lineas.entries()) {
      if (!controlaVencimiento.get(linea.id_producto)) {
        linea.fecha_vencimiento = null;
      } else if (!linea.id_lote && !linea.fecha_vencimiento) {
        throw new ApiError(
          400,
          `El producto de la línea ${indice + 1} controla vencimiento: la fecha de vencimiento es obligatoria`,
        );
      }
    }

    const numeroEntrada = `ENT-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const entradaResult = await cliente.query(
      `INSERT INTO entradas_inventario
         (numero_entrada, id_almacen, id_usuario, fecha_entrada, origen,
          referencia_externa, estado, resultado_verificacion, stock_confirmado, observaciones)
       VALUES ($1, $2, $3, $4::date::timestamp, $5, $6, 'RECIBIDA', $7, FALSE, $8)
       RETURNING id_entrada, numero_entrada, fecha_entrada, estado, resultado_verificacion, stock_confirmado`,
      [
        numeroEntrada,
        idAlmacen,
        req.user.id_usuario,
        fecha_entrada,
        nombreProveedor,
        refLimpia || null,
        resultado,
        String(observaciones || "").trim() || null,
      ],
    );
    const entrada = entradaResult.rows[0];

    const detallesRegistrados = [];
    for (const [indice, linea] of lineas.entries()) {
      const controla = controlaVencimiento.get(linea.id_producto);
      let lote = null;
      if (linea.id_lote) {
        const loteResult = await cliente.query(
          `SELECT id_lote, numero_lote, fecha_vencimiento
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
      } else if (linea.numero_lote) {
        // Mismo número de lote ya registrado en el almacén: se suma a ese lote
        // solo si la fecha de vencimiento coincide.
        const loteResult = await cliente.query(
          `SELECT id_lote, numero_lote, fecha_vencimiento
           FROM lotes_productos
           WHERE id_producto = $1 AND id_almacen = $2 AND numero_lote = $3
           FOR UPDATE`,
          [linea.id_producto, idAlmacen, linea.numero_lote],
        );
        if (loteResult.rowCount) {
          lote = loteResult.rows[0];
          const vencimientoExistente = formatoFechaLote(lote.fecha_vencimiento);
          if (controla && vencimientoExistente !== linea.fecha_vencimiento) {
            throw new ApiError(
              400,
              `El lote ${linea.numero_lote} de la línea ${indice + 1} ya existe con vencimiento ${vencimientoExistente || "sin fecha"}`,
            );
          }
        }
      }

      if (lote) {
        const vencimientoLote = formatoFechaLote(lote.fecha_vencimiento);
        if (controla) {
          if (!vencimientoLote) {
            throw new ApiError(
              400,
              `El lote de la línea ${indice + 1} no tiene fecha de vencimiento registrada`,
            );
          }
          if (vencimientoLote <= hoy) {
            throw new ApiError(
              400,
              `El lote de la línea ${indice + 1} ya está vencido; no se puede recibir más cantidad en él`,
            );
          }
        }
        linea.id_lote = lote.id_lote;
        linea.fecha_vencimiento = vencimientoLote;
      } else {
        // El lote nace vacío: sus unidades se suman al confirmar la recepción,
        // junto con el stock.
        const numeroLote =
          linea.numero_lote || `${entrada.numero_entrada}-${indice + 1}`;
        const loteResult = await cliente.query(
          `INSERT INTO lotes_productos
             (id_producto, id_almacen, numero_lote, fecha_ingreso,
              fecha_vencimiento, cantidad_inicial, cantidad_actual)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, 0)
           RETURNING id_lote, numero_lote, fecha_vencimiento`,
          [
            linea.id_producto,
            idAlmacen,
            numeroLote,
            linea.fecha_vencimiento,
          ],
        );
        lote = loteResult.rows[0];
      }

      await cliente.query(
        `INSERT INTO detalle_entradas
           (id_entrada, id_producto, id_lote, cantidad_solicitada, cantidad_recibida,
            estado_verificacion, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entrada.id_entrada,
          linea.id_producto,
          lote.id_lote,
          linea.cantidad_solicitada,
          linea.cantidad_recibida,
          linea.estado_verificacion,
          linea.observaciones,
        ],
      );
      detallesRegistrados.push({
        ...linea,
        id_lote: lote.id_lote,
        numero_lote: lote.numero_lote,
        fecha_vencimiento: formatoFechaLote(lote.fecha_vencimiento),
      });
    }

    await cliente.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: "Recepción registrada y verificación guardada. Confirme la recepción para actualizar el stock.",
      resultado_verificacion: resultado,
      data: {
        ...entrada,
        proveedor: nombreProveedor,
        resultado_verificacion: resultado,
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

const confirmarRecepcion = asyncHandler(async (req, res) => {
  const idEntrada = Number(req.params.id);
  if (!Number.isSafeInteger(idEntrada) || idEntrada <= 0) {
    throw new ApiError(400, "La recepción no es válida");
  }

  await asegurarColumnasVerificacion();
  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");

    const entradaResult = await cliente.query(
      `SELECT id_entrada, id_almacen, numero_entrada, stock_confirmado
       FROM entradas_inventario
       WHERE id_entrada = $1
       FOR UPDATE`,
      [idEntrada],
    );
    if (!entradaResult.rowCount) {
      throw new ApiError(404, "La recepción no existe");
    }

    const entrada = entradaResult.rows[0];
    if (entrada.stock_confirmado) {
      throw new ApiError(409, "Esta recepción ya fue confirmada y no puede volver a sumar stock");
    }

    const detallesResult = await cliente.query(
      `SELECT id_producto, id_lote, cantidad_recibida, observaciones
       FROM detalle_entradas
       WHERE id_entrada = $1
       ORDER BY id_detalle_entrada`,
      [idEntrada],
    );

    for (const linea of detallesResult.rows) {
      const cantidadRecibida = Number(linea.cantidad_recibida);
      if (!Number.isFinite(cantidadRecibida) || cantidadRecibida <= 0) continue;

      if (linea.id_lote) {
        await sumarALote(cliente, linea.id_lote, cantidadRecibida, { sumarInicial: true });
      }

      const stockResult = await cliente.query(
        `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (id_producto, id_almacen)
         DO UPDATE SET
           cantidad = stock.cantidad + EXCLUDED.cantidad,
           fecha_actualizacion = CURRENT_TIMESTAMP
         RETURNING cantidad, cantidad - $3::numeric AS stock_anterior`,
        [linea.id_producto, entrada.id_almacen, cantidadRecibida],
      );
      const { cantidad: stockNuevo, stock_anterior: stockAnterior } = stockResult.rows[0];

      await cliente.query(
        `INSERT INTO movimientos_inventario
           (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento, cantidad,
            stock_anterior, stock_nuevo, referencia, observaciones)
         VALUES ($1, $2, $3, $4, 'ENTRADA', $5, $6, $7, $8, $9)`,
        [
          linea.id_producto,
          entrada.id_almacen,
          linea.id_lote,
          req.user.id_usuario,
          cantidadRecibida,
          stockAnterior,
          stockNuevo,
          entrada.numero_entrada,
          linea.observaciones || `Confirmación de la recepción ${entrada.numero_entrada}`,
        ],
      );
    }

    await cliente.query(
      `UPDATE entradas_inventario
       SET stock_confirmado = TRUE
       WHERE id_entrada = $1`,
      [idEntrada],
    );

    await cliente.query("COMMIT");
    res.json({
      ok: true,
      message: "Recepción confirmada. El stock del almacén fue actualizado con las cantidades recibidas.",
      data: {
        id_entrada: entrada.id_entrada,
        numero_entrada: entrada.numero_entrada,
        stock_confirmado: true,
      },
    });
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir la confirmación de la recepción:", rollbackError);
    }
    throw error;
  } finally {
    cliente.release();
  }
});

const listarRecepciones = asyncHandler(async (req, res) => {
  await asegurarColumnasVerificacion();

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
      `SELECT e.id_entrada, e.numero_entrada, e.fecha_entrada, e.origen, e.origen AS proveedor,
              e.referencia_externa, e.estado, e.resultado_verificacion, e.stock_confirmado,
              a.id_almacen, a.codigo AS almacen_codigo, a.nombre AS almacen,
              u.nombre_completo AS usuario,
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

module.exports = { registrarRecepcion, confirmarRecepcion, listarRecepciones };
