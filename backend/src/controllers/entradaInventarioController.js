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

  const lineas = detalles.map((detalle, indice) => {
    if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) {
      throw new ApiError(400, `El detalle de la línea ${indice + 1} no es válido`);
    }

    const idProducto = Number(detalle.id_producto);
    const cantidad = Number(detalle.cantidad_recibida);
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
      typeof detalle.cantidad_recibida === "boolean" ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
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

    return {
      id_producto: idProducto,
      cantidad,
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
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, 'RECIBIDA', $6)
       RETURNING id_entrada, numero_entrada, fecha_entrada, estado`,
      [
        numeroEntrada,
        idAlmacen,
        req.user.id_usuario,
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
           (id_entrada, id_producto, id_lote, cantidad_solicitada, cantidad_recibida, observaciones)
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [
          entrada.id_entrada,
          linea.id_producto,
          lote.id_lote,
          linea.cantidad,
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
        [linea.id_producto, idAlmacen, linea.cantidad],
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
          linea.cantidad,
          stockAnterior,
          stockNuevo,
          entrada.numero_entrada,
          linea.observaciones || `Recepción del proveedor ${nombreProveedor}`,
        ],
      );
    }

    await cliente.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: "Recepción registrada y stock actualizado",
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

module.exports = { registrarRecepcion };