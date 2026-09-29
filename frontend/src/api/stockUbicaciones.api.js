import api from "./axios";

export const asignarProductoAUbicacion = (data) =>
  api.post("/stock-ubicaciones", data).then((r) => r.data);

export const actualizarCantidadUbicacion = (id, cantidad) =>
  api.put(`/stock-ubicaciones/${id}`, { cantidad }).then((r) => r.data);

export const quitarProductoDeUbicacion = (id) =>
  api.delete(`/stock-ubicaciones/${id}`).then((r) => r.data);