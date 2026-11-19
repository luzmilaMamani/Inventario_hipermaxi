import api from "./axios";

// RF75: métricas de las integraciones asíncronas y reproceso de mensajes con error.
export const consultarMetricasIntegracion = (params) =>
  api.get("/integraciones/metricas", { params }).then((r) => r.data);

export const reprocesarMensajeIntegracion = (tipo, idMensaje) =>
  api
    .post(`/integraciones/mensajes/${encodeURIComponent(tipo)}/${encodeURIComponent(idMensaje)}/reprocesar`)
    .then((r) => r.data);
