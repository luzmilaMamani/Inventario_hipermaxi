const { randomUUID } = require("node:crypto");
const env = require("../config/env");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { procesarMensajeVenta } = require("../services/suscriptorVentas");

const ESTADO_HTTP = { PROCESADO: 200, DUPLICADO: 200, ERROR: 409, INVALIDO: 400 };

// RF72: simula al SI de Ventas. Recibe el mismo JSON que llegaría por Pub/Sub y
// lo entrega al mismo procesamiento del suscriptor (idempotencia, FEFO, errores
// reprocesables). Si faltan id_mensaje, tipo_evento o fecha, se completan.
const simularVenta = asyncHandler(async (req, res) => {
  if (env.nodeEnv === "production") {
    throw new ApiError(403, "La simulación no está disponible en producción");
  }

  const mensaje = {
    id_mensaje: randomUUID(),
    tipo_evento: "venta.confirmada",
    fecha: new Date().toISOString(),
    ...req.body,
  };
  const resultado = await procesarMensajeVenta(mensaje);

  res.status(ESTADO_HTTP[resultado.estado] ?? 200).json({
    ok: resultado.estado === "PROCESADO" || resultado.estado === "DUPLICADO",
    message: resultado.error || `Mensaje ${resultado.estado.toLowerCase()}`,
    data: { ...resultado, mensaje },
  });
});

module.exports = { simularVenta };
