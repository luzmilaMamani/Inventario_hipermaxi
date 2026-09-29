import api from "./axios";

export const listarUbicaciones = (params) =>
  api.get("/ubicaciones", { params }).then((r) => r.data);

export const obtenerUbicacion = (id) =>
  api.get(`/ubicaciones/${id}`).then((r) => r.data);

export const obtenerStockUbicacion = (id) =>
  api.get(`/ubicaciones/${id}/stock`).then((r) => r.data);

export const crearUbicacion = (data) =>
  api.post("/ubicaciones", data).then((r) => r.data);

export const actualizarUbicacion = (id, data) =>
  api.put(`/ubicaciones/${id}`, data).then((r) => r.data);

export const eliminarUbicacion = (id) =>
  api.delete(`/ubicaciones/${id}`).then((r) => r.data);