const ApiError = require("../utils/apiError");

const MOTIVOS_VALIDOS = [
  "VENTA",
  "PERDIDA",
  "DANO",
  "VENCIMIENTO",
  "TRANSFERENCIA",
  "AJUSTE",
  "OTRO",
];

// Motivos que requieren observación obligatoria (mínimo 5 caracteres)
const MOTIVOS_CON_OBSERVACION = ["PERDIDA", "DANO", "VENCIMIENTO", "OTRO"];

const SUBTIPOS_PERDIDA = ["ROBO", "EXTRAVIO", "OTRO"];
const SUBTIPOS_DANO = ["ROTO", "DETERIORO", "INUTILIZABLE", "OTRO"];

function validarCrearSalida(req, _res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return next(new ApiError(400, "El cuerpo de la solicitud no es válido"));
  }

  const { id_almacen, motivo, observaciones, subtipo_perdida, detalles } =
    req.body;

  const idAlmacen = Number(id_almacen);
  if (
    typeof id_almacen === "boolean" ||
    !Number.isSafeInteger(idAlmacen) ||
    idAlmacen <= 0
  ) {
    return next(new ApiError(400, "Debe seleccionar un almacén válido"));
  }
  if (!motivo || !MOTIVOS_VALIDOS.includes(motivo)) {
    return next(
      new ApiError(
        400,
        `Motivo inválido. Permitidos: ${MOTIVOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    return next(
      new ApiError(400, "Debe incluir entre 1 y 100 productos en el detalle"),
    );
  }

  if (MOTIVOS_CON_OBSERVACION.includes(motivo)) {
    if (!observaciones || String(observaciones).trim().length < 5) {
      return next(
        new ApiError(
          400,
          `Para salidas por ${motivo} la observación es obligatoria (mínimo 5 caracteres)`,
        ),
      );
    }
  }

  if (
    motivo === "PERDIDA" &&
    subtipo_perdida &&
    !SUBTIPOS_PERDIDA.includes(subtipo_perdida)
  ) {
    return next(
      new ApiError(
        400,
        `Subtipo de pérdida inválido. Permitidos: ${SUBTIPOS_PERDIDA.join(", ")}`,
      ),
    );
  }
  if (
    motivo === "DANO" &&
    subtipo_perdida &&
    !SUBTIPOS_DANO.includes(subtipo_perdida)
  ) {
    return next(
      new ApiError(
        400,
        `Subtipo de daño inválido. Permitidos: ${SUBTIPOS_DANO.join(", ")}`,
      ),
    );
  }

  if (
    subtipo_perdida &&
    motivo !== "PERDIDA" &&
    motivo !== "DANO"
  ) {
    return next(
      new ApiError(400, "El subtipo solo aplica para salidas por pérdida o daño"),
    );
  }

  const productosIncluidos = new Set();
  for (const [i, d] of detalles.entries()) {
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      return next(new ApiError(400, `Detalle ${i + 1}: formato inválido`));
    }

    const idProducto = Number(d.id_producto);
    if (
      typeof d.id_producto === "boolean" ||
      !Number.isSafeInteger(idProducto) ||
      idProducto <= 0
    ) {
      return next(
        new ApiError(400, `Detalle ${i + 1}: el producto es obligatorio`),
      );
    }
    if (productosIncluidos.has(idProducto)) {
      return next(
        new ApiError(400, `Detalle ${i + 1}: el producto está repetido`),
      );
    }
    productosIncluidos.add(idProducto);

    const cantidad = Number(d.cantidad);
    if (
      typeof d.cantidad === "boolean" ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
      return next(
        new ApiError(400, `Detalle ${i + 1}: la cantidad debe ser mayor a 0`),
      );
    }
  }

  return next();
}

module.exports = {
  validarCrearSalida,
  MOTIVOS_VALIDOS,
  MOTIVOS_CON_OBSERVACION,
  SUBTIPOS_PERDIDA,
  SUBTIPOS_DANO,
};
