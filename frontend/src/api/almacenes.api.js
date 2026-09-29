import api from "./axios";

export const listarAlmacenes = (params) =>
  api.get("/almacenes", { params }).then((r) => r.data);

export const obtenerAlmacen = (id) =>
  api.get(`/almacenes/${id}`).then((r) => r.data);

export const obtenerStockAlmacen = (id) =>
  api.get(`/almacenes/${id}/stock`).then((r) => r.data);

export const crearAlmacen = (data) =>
  api.post("/almacenes", data).then((r) => r.data);

export const actualizarAlmacen = (id, data) =>
  api.put(`/almacenes/${id}`, data).then((r) => r.data);

export const eliminarAlmacen = (id) =>
  api.delete(`/almacenes/${id}`).then((r) => r.data);