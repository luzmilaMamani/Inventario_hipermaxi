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

  const sql = readFileSync(
    path.join(__dirname, "../../sql/rf20_verificacion_recepcion.sql"),
    "utf8",
  );
  await db.query(sql);
  columnasVerificacionListas = true;
}

const registrarRecepcion = asyncHandler(async (req, res) => {
  const { id_almacen, proveedor, referencia_externa, observaciones, detalles } =
    req.body;
  const idAlmacen = Number(id_almacen);
  const nombreProveedor = String(proveedor || "").trim();

  if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
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
    const idProducto = Number(detalle.id_producto);

    if (!Number.isSafeInteger(idProducto) || idProducto <= 0) {
      throw new ApiError(400, `El producto de la línea ${indice + 1} no es válido`);
    }

    const verificacion = evaluarLineaRecepcion(detalle, indice);

    return {
      id_producto: idProducto,
      ...verificacion,
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
          referencia_externa, estado, resultado_verificacion, observaciones)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, 'RECIBIDA', $6, $7)
       RETURNING id_entrada, numero_entrada, fecha_entrada, estado, resultado_verificacion`,
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

    for (const linea of lineas) {
      await cliente.query(
        `INSERT INTO detalle_entradas
           (id_entrada, id_producto, cantidad_solicitada, cantidad_recibida,
            estado_verificacion, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entrada.id_entrada,
          linea.id_producto,
          linea.cantidad_solicitada,
          linea.cantidad_recibida,
          linea.estado_verificacion,
          linea.observaciones,
        ],
      );

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
           (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
            stock_anterior, stock_nuevo, referencia, observaciones)
         VALUES ($1, $2, $3, 'ENTRADA', $4, $5, $6, $7, $8)`,
        [
          linea.id_producto,
          idAlmacen,
          req.user.id_usuario,
          linea.cantidad_recibida,
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
      message: "Recepción registrada, verificación guardada y stock actualizado",
      data: {
        ...entrada,
        proveedor: nombreProveedor,
        resultado_verificacion: resultado,
        detalles: lineas,
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
