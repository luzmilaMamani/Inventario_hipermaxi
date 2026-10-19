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

const MOTIVOS_CON_OBSERVACION = ["PERDIDA", "DANO", "VENCIMIENTO"];

const SUBTIPOS_PERDIDA = ["ROBO", "EXTRAVIO", "OTRO"];
const SUBTIPOS_DANO = ["ROTO", "DETERIORO", "INUTILIZABLE", "OTRO"];

function validarCrearSalida(req, _res, next) {
  const { id_almacen, motivo, observaciones, subtipo_perdida, detalles } =
    req.body;

  if (!id_almacen) {
    return next(new ApiError(400, "El almacén es obligatorio"));
  }
  if (!motivo || !MOTIVOS_VALIDOS.includes(motivo)) {
    return next(
      new ApiError(
        400,
        `Motivo inválido. Permitidos: ${MOTIVOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (!Array.isArray(detalles) || detalles.length === 0) {
    return next(
      new ApiError(400, "Debe incluir al menos un producto en el detalle"),
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

  for (const [i, d] of detalles.entries()) {
    if (!d.id_producto) {
      return next(
        new ApiError(400, `Detalle ${i + 1}: el producto es obligatorio`),
      );
    }
    if (d.cantidad === undefined || Number(d.cantidad) <= 0) {
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
