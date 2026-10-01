import api from "./axios";
import { esVistaPrevia, productosPreview } from "./preview";

export const listarProductos = (params) => {
  if (esVistaPrevia) return Promise.resolve(productosPreview);
  return api.get("/productos", { params }).then((r) => r.data);
};

export const buscarProductosRapido = (q, limit = 10) =>
  api
    .get("/productos/buscar", { params: { q, limit } })
    .then((r) => r.data);

export const obtenerProducto = (id) =>
  api.get(`/productos/${id}`).then((r) => r.data);

export const buscarPorCodigoBarras = (codigo) =>
  api.get(`/productos/barcode/${codigo}`).then((r) => r.data);

export const cambiarEstadoProducto = (id, estado, motivo) =>
  api
    .put(`/productos/${id}/estado`, { estado, motivo })
    .then((r) => r.data);

export const crearProducto = (data) =>
  api.post("/productos", data).then((r) => r.data);

export const actualizarProducto = (id, data) =>
  api.put(`/productos/${id}`, data).then((r) => r.data);