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
  if (stock_minimo !== undefined && Number(stock_minimo) < 0) {
    return next(new ApiError(400, "El stock mínimo no puede ser negativo"));
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
  if (punto_reposicion !== undefined && Number(punto_reposicion) < 0) {
    return next(
      new ApiError(400, "El punto de reposición no puede ser negativo"),
    );
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
  const { stock_minimo, stock_maximo, punto_reposicion, estado } = req.body;

  if (stock_minimo !== undefined && Number(stock_minimo) < 0) {
    return next(new ApiError(400, "El stock mínimo no puede ser negativo"));
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
  if (punto_reposicion !== undefined && Number(punto_reposicion) < 0) {
    return next(
      new ApiError(400, "El punto de reposición no puede ser negativo"),
    );
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

module.exports = { validarCrearProducto, validarActualizarProducto };
