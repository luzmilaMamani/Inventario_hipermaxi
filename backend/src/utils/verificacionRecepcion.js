const ApiError = require("./apiError");

const CONFORME = "CONFORME";
const CON_DIFERENCIA = "CON_DIFERENCIA";

function leerCantidadObligatoria(valor, indice, etiqueta) {
  if (valor === "" || valor === null || valor === undefined) {
    throw new ApiError(400, `Indique la ${etiqueta} de la línea ${indice + 1}`);
  }

  const cantidad = Number(valor);
  if (!Number.isFinite(cantidad)) {
    throw new ApiError(400, `La ${etiqueta} de la línea ${indice + 1} no es válida`);
  }
  if (cantidad < 0) {
    throw new ApiError(400, "No se permiten cantidades negativas");
  }
  if (cantidad <= 0) {
    throw new ApiError(
      400,
      `La ${etiqueta} de la línea ${indice + 1} debe ser mayor a cero`,
    );
  }

  return cantidad;
}

function evaluarLineaRecepcion(detalle, indice) {
  const hayEsperada =
    detalle.cantidad_solicitada !== undefined &&
    detalle.cantidad_solicitada !== null &&
    detalle.cantidad_solicitada !== "";

  if (!hayEsperada) {
    const cantidad = Number(detalle.cantidad_recibida);
    if (!Number.isFinite(cantidad)) {
      throw new ApiError(400, `La cantidad de la línea ${indice + 1} no es válida`);
    }
    if (cantidad < 0) {
      throw new ApiError(400, "No se permiten cantidades negativas");
    }
    if (cantidad <= 0) {
      throw new ApiError(400, `La cantidad de la línea ${indice + 1} debe ser mayor a cero`);
    }

    return {
      cantidad_solicitada: cantidad,
      cantidad_recibida: cantidad,
      estado_verificacion: CONFORME,
    };
  }

  const cantidadEsperada = leerCantidadObligatoria(
    detalle.cantidad_solicitada,
    indice,
    "cantidad esperada",
  );
  const cantidadRecibida = leerCantidadObligatoria(
    detalle.cantidad_recibida,
    indice,
    "cantidad recibida",
  );

  return {
    cantidad_solicitada: cantidadEsperada,
    cantidad_recibida: cantidadRecibida,
    estado_verificacion: cantidadEsperada === cantidadRecibida ? CONFORME : CON_DIFERENCIA,
  };
}

function resultadoVerificacion(lineas) {
  return lineas.every((linea) => linea.estado_verificacion === CONFORME) ? CONFORME : CON_DIFERENCIA;
}

module.exports = {
  CONFORME,
  CON_DIFERENCIA,
  evaluarLineaRecepcion,
  resultadoVerificacion,
};
