const ApiError = require("../utils/apiError");

const TIPOS_VALIDOS = ["CENTRAL", "SUCURSAL", "DEPOSITO"];

function validarCrearAlmacen(req, _res, next) {
  const { codigo, nombre, tipo, capacidad } = req.body;

  if (!codigo || !String(codigo).trim()) {
    return next(new ApiError(400, "El código del almacén es obligatorio"));
  }
  if (!nombre || !String(nombre).trim()) {
    return next(new ApiError(400, "El nombre del almacén es obligatorio"));
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return next(
      new ApiError(
        400,
        `Tipo inválido. Permitidos: ${TIPOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (capacidad !== undefined && capacidad !== null && Number(capacidad) < 0) {
    return next(new ApiError(400, "La capacidad no puede ser negativa"));
  }
  return next();
}

function validarActualizarAlmacen(req, _res, next) {
  const { tipo, capacidad } = req.body;

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return next(
      new ApiError(
        400,
        `Tipo inválido. Permitidos: ${TIPOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (capacidad !== undefined && capacidad !== null && Number(capacidad) < 0) {
    return next(new ApiError(400, "La capacidad no puede ser negativa"));
  }
  return next();
}

module.exports = {
  validarCrearAlmacen,
  validarActualizarAlmacen,
  TIPOS_VALIDOS,
};