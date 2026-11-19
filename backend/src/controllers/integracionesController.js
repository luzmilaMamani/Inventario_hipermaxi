const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { esFechaValida } = require("../utils/filtrosReporte");
const { metricasPorSistema, reprocesar } = require("../services/metricasIntegracion");

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

// RF75: GET /api/integraciones/metricas?fecha_desde&fecha_hasta (por defecto, 30 días).
const consultarMetricas = asyncHandler(async (req, res) => {
  const desde = req.query.fecha_desde || haceDias(29);
  const hasta = req.query.fecha_hasta || hoy();
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new ApiError(400, "Las fechas no son válidas");
  }
  if (desde > hasta) throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  res.json({ ok: true, data: await metricasPorSistema({ desde, hasta }) });
});

// RF75: POST /api/integraciones/mensajes/:tipo/:id/reprocesar
const reprocesarMensaje = asyncHandler(async (req, res) => {
  const resultado = await reprocesar(req.params.tipo, req.params.id);
  const ok = resultado.estado === "PROCESADO";
  res.json({
    ok,
    message: ok
      ? "Mensaje reprocesado correctamente"
      : `El mensaje sigue ${resultado.estado}: ${resultado.error}`,
    data: resultado,
  });
});

module.exports = { consultarMetricas, reprocesarMensaje };
