const ApiError = require("../utils/apiError");

function validarCrearUbicacion(req, _res, next) {
  const { id_almacen, zona, pasillo, estante, nivel } = req.body;

  if (!id_almacen) {
    return next(new ApiError(400, "El almacén es obligatorio"));
  }

  if (!zona && !pasillo && !estante && !nivel) {
    return next(
      new ApiError(
        400,
        "Debes especificar al menos zona, pasillo, estante o nivel",
      ),
    );
  }

  return next();
}

function validarAsignarProducto(req, _res, next) {
  const { id_producto, id_ubicacion, cantidad } = req.body;

  if (!id_producto) {
    return next(new ApiError(400, "El producto es obligatorio"));
  }
  if (!id_ubicacion) {
    return next(new ApiError(400, "La ubicación es obligatoria"));
  }
  if (cantidad === undefined || Number(cantidad) <= 0) {
    return next(new ApiError(400, "La cantidad debe ser mayor a 0"));
  }

  return next();
}

module.exports = {
  validarCrearUbicacion,
  validarAsignarProducto,
};