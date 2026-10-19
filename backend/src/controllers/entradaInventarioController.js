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

const registrarRecepcion = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }

  const { id_almacen, proveedor, referencia_externa, observaciones, detalles } =
    req.body;
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
  if (nombreProveedor.length > 150) {
    throw new ApiError(400, "El nombre del proveedor no puede superar 150 caracteres");
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    throw new ApiError(400, "La recepción debe incluir entre 1 y 100 productos");
  }

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
    if (typeof detalle.cantidad_recibida === "boolean") {
      throw new ApiError(400, `La cantidad de la línea ${indice + 1} debe ser mayor a cero`);
    }
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

    const verificacion = evaluarLineaRecepcion(detalle, indice);

    return {
      id_producto: idProducto,
      ...verificacion,
      cantidad: verificacion.cantidad_recibida,
      id_lote: idLote,
      numero_lote: String(detalle.numero_lote || "").trim() || null,
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
          referencia_externa, estado, resultado_verificacion, stock_confirmado, observaciones)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, 'RECIBIDA', $6, FALSE, $7)
       RETURNING id_entrada, numero_entrada, fecha_entrada, estado, resultado_verificacion, stock_confirmado`,
      [
        numeroEntrada,
        idAlmacen,
        req.user.id_usuario,
        nombreProveedor,
        String(referencia_externa || "").trim() || null,
        resultado,
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
          [linea.cantidad, lote.id_lote],
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
            linea.cantidad,
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
      });
    }

    await cliente.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: "Recepción registrada y verificación guardada. Confirme la recepción para actualizar el stock.",
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

module.exports = { registrarRecepcion, confirmarRecepcion };
