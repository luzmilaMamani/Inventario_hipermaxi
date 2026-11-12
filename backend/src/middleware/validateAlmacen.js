const ApiError = require("../utils/apiError");

const TIPOS_VALIDOS = ["CENTRAL", "SUCURSAL", "DEPOSITO"];

function superficieInvalida(superficie) {
  return (
    superficie !== undefined &&
    superficie !== null &&
    (String(superficie).trim() === "" ||
      !Number.isFinite(Number(superficie)) ||
      Number(superficie) <= 0)
  );
}

function contactoInvalido(telefono, responsable) {
  if (
    telefono !== undefined &&
    telefono !== null &&
    String(telefono).trim().length > 30
  ) {
    return "El teléfono no puede superar 30 caracteres";
  }
  if (
    responsable !== undefined &&
    responsable !== null &&
    String(responsable).trim().length > 150
  ) {
    return "El responsable no puede superar 150 caracteres";
  }
  return "";
}

function validarCrearAlmacen(req, _res, next) {
  const { codigo, nombre, tipo, superficie_m2, telefono, responsable } = req.body;

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
  if (superficieInvalida(superficie_m2)) {
    return next(new ApiError(400, "La superficie debe ser un número mayor a 0 m²"));
  }
  const errorContacto = contactoInvalido(telefono, responsable);
  if (errorContacto) return next(new ApiError(400, errorContacto));
  return next();
}

function validarActualizarAlmacen(req, _res, next) {
  const { tipo, superficie_m2, telefono, responsable } = req.body;

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return next(
      new ApiError(
        400,
        `Tipo inválido. Permitidos: ${TIPOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  if (superficieInvalida(superficie_m2)) {
    return next(new ApiError(400, "La superficie debe ser un número mayor a 0 m²"));
  }
  const errorContacto = contactoInvalido(telefono, responsable);
  if (errorContacto) return next(new ApiError(400, errorContacto));
  return next();
}

module.exports = {
  validarCrearAlmacen,
  validarActualizarAlmacen,
  TIPOS_VALIDOS,
};