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

export const obtenerProducto = (id) => {
  if (esVistaPrevia) {
    const producto = productosPreview.data.find(
      (item) => Number(item.id_producto) === Number(id),
    );
    return Promise.resolve({ ok: true, data: producto || null });
  }
  return api.get(`/productos/${id}`).then((r) => r.data);
};

export const buscarPorCodigoBarras = (codigo) => {
  if (esVistaPrevia) {
    const producto = productosPreview.data.find(
      (item) => item.codigo_barras === codigo || item.codigo === codigo,
    );
    if (!producto) {
      return Promise.reject({
        response: { data: { message: "No se encontró producto con ese código de barras" } },
      });
    }
    return Promise.resolve({ ok: true, data: producto });
  }
  return api.get(`/productos/barcode/${codigo}`).then((r) => r.data);
};

export const cambiarEstadoProducto = (id, estado, motivo) =>
  api
    .put(`/productos/${id}/estado`, { estado, motivo })
    .then((r) => r.data);

export const crearProducto = (data) =>
  api.post("/productos", data).then((r) => r.data);

export const actualizarProducto = (id, data) =>
  api.put(`/productos/${id}`, data).then((r) => r.data);