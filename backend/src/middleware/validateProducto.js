const ApiError = require("../utils/apiError");

const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO", "DESCONTINUADO"];

function validarCrearProducto(req, _res, next) {
  const {
    codigo,
    nombre,
    id_categoria,
    id_unidad,
    stock_minimo,
    stock_maximo,
    punto_reposicion,
    unidades_por_pale,
    precio,
    estado,
  } = req.body;

  if (!codigo || !String(codigo).trim()) {
    return next(new ApiError(400, "El código del producto es obligatorio"));
  }
  if (!nombre || !String(nombre).trim()) {
    return next(new ApiError(400, "El nombre del producto es obligatorio"));
  }
  if (!id_categoria) {
    return next(new ApiError(400, "La categoría es obligatoria"));
  }
  if (!id_unidad) {
    return next(new ApiError(400, "La unidad de medida es obligatoria"));
  }
  if (stock_minimo !== undefined &&
      (!Number.isSafeInteger(Number(stock_minimo)) || Number(stock_minimo) < 0)) {
    return next(new ApiError(400, "El stock mínimo debe ser un número entero igual o mayor a 0"));
  }
  if (
    stock_maximo !== undefined &&
    (!Number.isSafeInteger(Number(stock_maximo)) || Number(stock_maximo) < 0)
  ) {
    return next(new ApiError(400, "El stock máximo debe ser un número entero igual o mayor a 0"));
  }
  if (
    stock_maximo !== undefined &&
    stock_minimo !== undefined &&
    Number(stock_maximo) < Number(stock_minimo)
  ) {
    return next(
      new ApiError(400, "El stock máximo debe ser mayor o igual al mínimo"),
    );
  }
  if (punto_reposicion !== undefined &&
      (!Number.isSafeInteger(Number(punto_reposicion)) || Number(punto_reposicion) < 0)) {
    return next(
      new ApiError(400, "El punto de reposición debe ser un número entero igual o mayor a 0"),
    );
  }
  if (
    unidades_por_pale !== undefined &&
    unidades_por_pale !== null &&
    (!Number.isSafeInteger(Number(unidades_por_pale)) ||
      Number(unidades_por_pale) <= 0)
  ) {
    return next(
      new ApiError(400, "Las unidades por palé deben ser un número entero mayor a 0"),
    );
  }
  if (
    precio !== undefined &&
    (!Number.isFinite(Number(precio)) || Number(precio) < 0)
  ) {
    return next(new ApiError(400, "El precio debe ser un número mayor o igual a 0"));
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return next(
      new ApiError(
        400,
        `Estado inválido. Permitidos: ${ESTADOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  return next();
}

function validarActualizarProducto(req, _res, next) {
  const {
    stock_minimo,
    stock_maximo,
    punto_reposicion,
    unidades_por_pale,
    precio,
    estado,
  } = req.body;

  if (stock_minimo !== undefined &&
      (!Number.isSafeInteger(Number(stock_minimo)) || Number(stock_minimo) < 0)) {
    return next(new ApiError(400, "El stock mínimo debe ser un número entero igual o mayor a 0"));
  }
  if (
    stock_maximo !== undefined &&
    (!Number.isSafeInteger(Number(stock_maximo)) || Number(stock_maximo) < 0)
  ) {
    return next(new ApiError(400, "El stock máximo debe ser un número entero igual o mayor a 0"));
  }
  if (
    stock_maximo !== undefined &&
    stock_minimo !== undefined &&
    Number(stock_maximo) < Number(stock_minimo)
  ) {
    return next(
      new ApiError(400, "El stock máximo debe ser mayor o igual al mínimo"),
    );
  }
  if (punto_reposicion !== undefined &&
      (!Number.isSafeInteger(Number(punto_reposicion)) || Number(punto_reposicion) < 0)) {
    return next(
      new ApiError(400, "El punto de reposición debe ser un número entero igual o mayor a 0"),
    );
  }
  if (
    unidades_por_pale !== undefined &&
    unidades_por_pale !== null &&
    (!Number.isSafeInteger(Number(unidades_por_pale)) ||
      Number(unidades_por_pale) <= 0)
  ) {
    return next(
      new ApiError(400, "Las unidades por palé deben ser un número entero mayor a 0"),
    );
  }
  if (
    precio !== undefined &&
    (!Number.isFinite(Number(precio)) || Number(precio) < 0)
  ) {
    return next(new ApiError(400, "El precio debe ser un número mayor o igual a 0"));
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return next(
      new ApiError(
        400,
        `Estado inválido. Permitidos: ${ESTADOS_VALIDOS.join(", ")}`,
      ),
    );
  }
  return next();
}

function validarCambioEstado(req, _res, next) {
  const { estado } = req.body;

  if (!estado) {
    return next(new ApiError(400, "El campo 'estado' es obligatorio"));
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return next(
      new ApiError(
        400,
        `Estado inválido. Permitidos: ${ESTADOS_VALIDOS.join(", ")}`,
      ),
    );
  }

  return next();
}

module.exports = {
  validarCrearProducto,
  validarActualizarProducto,
  validarCambioEstado,
};