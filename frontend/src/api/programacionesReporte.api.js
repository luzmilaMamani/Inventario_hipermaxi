import api from "./axios";

// RF70: programación del envío automático de reportes por correo.
export const listarTiposReporte = () =>
  api.get("/programaciones-reporte/tipos").then((r) => r.data);

export const listarProgramaciones = () =>
  api.get("/programaciones-reporte").then((r) => r.data);

export const crearProgramacion = (data) =>
  api.post("/programaciones-reporte", data).then((r) => r.data);

export const actualizarProgramacion = (id, data) =>
  api.put(`/programaciones-reporte/${id}`, data).then((r) => r.data);

export const cambiarEstadoProgramacion = (id, activo) =>
  api.patch(`/programaciones-reporte/${id}/estado`, { activo }).then((r) => r.data);

export const enviarProgramacionAhora = (id) =>
  api.post(`/programaciones-reporte/${id}/enviar`).then((r) => r.data);

export const listarEnviosReporte = (id) =>
  api
    .get(id ? `/programaciones-reporte/${id}/envios` : "/programaciones-reporte/envios")
    .then((r) => r.data);
