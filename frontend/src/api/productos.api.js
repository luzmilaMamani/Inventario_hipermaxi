import api from "./axios";

export const listarProductos = (params) =>
  api.get("/productos", { params }).then((r) => r.data);

export const obtenerProducto = (id) =>
  api.get(`/productos/${id}`).then((r) => r.data);

export const cambiarEstadoProducto = (id, estado, motivo) =>
  api
    .put(`/productos/${id}/estado`, { estado, motivo })
    .then((r) => r.data);