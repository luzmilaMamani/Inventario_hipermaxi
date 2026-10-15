const ApiError = require("../utils/apiError");

const TIPOS_VALIDOS = [
  "VENTA",
  "PERDIDA",
  "AJUSTE",
  "DEVOLUCION",
  "TRANSFERENCIA",
];
const SUBTIPOS_PERDIDA = [
  "ROBO",
  "EXTRAVIO",
  "DETERIORO",
  "VENCIMIENTO",
  "OTRO",
];

function validarCrearSalida(req, _res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return next(new ApiError(400, "El cuerpo de la solicitud no es válido"));
  }

  const { id_almacen, tipo_salida, observaciones, subtipo_perdida, detalles } =
    req.body;

  const idAlmacen = Number(id_almacen);
  if (
    typeof id_almacen === "boolean" ||
    !Number.isSafeInteger(idAlmacen) ||
    idAlmacen <= 0
  ) {
    return next(new ApiError(400, "Debe seleccionar un almacén válido"));
  }
  if (!tipo_salida || !TIPOS_VALIDOS.includes(tipo_salida)) {
    return next(
      new ApiError(
        400,
        `Tipo inválido. Permitidos: ${TIPOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > 100) {
    return next(
      new ApiError(400, "Debe incluir entre 1 y 100 productos en el detalle"),
    );
  }

  if (tipo_salida === "PERDIDA") {
    if (!observaciones || String(observaciones).trim().length < 5) {
      return next(
        new ApiError(
          400,
          "Para salidas por PÉRDIDA la observación es obligatoria (mínimo 5 caracteres)",
        ),
      );
    }
    if (subtipo_perdida && !SUBTIPOS_PERDIDA.includes(subtipo_perdida)) {
      return next(
        new ApiError(
          400,
          `Subtipo inválido. Permitidos: ${SUBTIPOS_PERDIDA.join(", ")}`,
        ),
      );
    }
  }

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

    const cantidad = Number(d.cantidad);
    if (
      d.cantidad === undefined ||
      typeof d.cantidad === "boolean" ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
      return next(
        new ApiError(400, `Detalle ${i + 1}: la cantidad debe ser mayor a 0`),
      );
    }

    if (
      d.id_lote !== undefined &&
      d.id_lote !== null &&
      d.id_lote !== "" &&
      (typeof d.id_lote === "boolean" ||
        !Number.isSafeInteger(Number(d.id_lote)) ||
        Number(d.id_lote) <= 0)
    ) {
      return next(new ApiError(400, `Detalle ${i + 1}: el lote no es válido`));
    }
  }

  return next();
}

module.exports = { validarCrearSalida, TIPOS_VALIDOS, SUBTIPOS_PERDIDA };
