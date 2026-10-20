import api from "./axios";

export const listarTransferencias = (params) =>
  api.get("/transferencias", { params }).then((r) => r.data);

export const obtenerTransferencia = (id) =>
  api.get(`/transferencias/${id}`).then((r) => r.data);

export const crearTransferencia = (data) =>
  api.post("/transferencias", data).then((r) => r.data);

export const cambiarEstadoTransferencia = (id, estado) =>
  api.put(`/transferencias/${id}/estado`, { estado }).then((r) => r.data);
