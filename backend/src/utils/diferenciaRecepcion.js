const ApiError = require("./apiError");

const TIPOS = {
  FALTANTE: "FALTANTE",
  SOBRANTE: "SOBRANTE",
  DANADO: "DANADO",
};

function normalizarTipo(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function normalizarDiferencia(body) {
  const idProducto = Number(body.id_producto);
  const tipo = normalizarTipo(body.tipo);
  const cantidad = Number(body.cantidad);
  const observacion = String(body.observacion ?? "").trim();

  if (!Number.isSafeInteger(idProducto) || idProducto <= 0) {
    throw new ApiError(400, "Debe seleccionar un producto de la recepción");
  }
  if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) {
    throw new ApiError(400, "El tipo debe ser faltante, sobrante o dañado");
  }
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    throw new ApiError(400, "No se permiten cantidades negativas");
  }
  if (cantidad <= 0) {
    throw new ApiError(400, "La cantidad de la diferencia debe ser mayor a cero");
  }
  if (!observacion) {
    throw new ApiError(400, "La observación es obligatoria");
  }
  if (observacion.length > 500) {
    throw new ApiError(400, "La observación no puede superar 500 caracteres");
  }

  return {
    id_producto: idProducto,
    tipo,
    cantidad,
    observacion,
  };
}

module.exports = {
  TIPOS,
  normalizarDiferencia,
};
