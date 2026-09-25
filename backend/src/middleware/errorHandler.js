function notFound(req, _res, next) {
  const error = new Error(`Ruta no encontrada: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, _req, res, _next) {
  // Unique violation
  if (error.code === "23505") {
    const match = error.detail?.match(/Key \((.*?)\)=/);
    const campo = match ? match[1] : "campo";
    return res.status(409).json({
      ok: false,
      message: `Ya existe un registro con ese valor en: ${campo}`,
      detail: error.detail,
    });
  }
  // Foreign key violation
  if (error.code === "23503") {
    return res.status(400).json({
      ok: false,
      message: "Referencia inválida: el registro relacionado no existe",
      detail: error.detail,
    });
  }
  // Check violation (ej: estado inválido, stock negativo)
  if (error.code === "23514") {
    return res.status(400).json({
      ok: false,
      message: "Valor inválido según las reglas del sistema",
      detail: error.detail,
    });
  }
  // Not null violation
  if (error.code === "23502") {
    const match = error.message?.match(/column "(.*?)"/);
    return res.status(400).json({
      ok: false,
      message: `El campo ${match ? match[1] : ""} es obligatorio`,
    });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    message: error.message || "Error interno del servidor",
  });
}

module.exports = { notFound, errorHandler };
