import api from "./axios";

export const ESTADOS_PRODUCTO = [
  { value: "APTO", label: "Apto (reingresa al stock)" },
  { value: "NO_APTO", label: "No apto (salida por daño)" },
];

export const listarDevoluciones = (params) =>
  api.get("/devoluciones", { params }).then((r) => r.data);

export const obtenerDevolucion = (id) =>
  api.get(`/devoluciones/${id}`).then((r) => r.data);

export const buscarVentas = (search) =>
  api.get("/devoluciones/ventas", { params: { search } }).then((r) => r.data);

export const obtenerVentaDevolvible = (id) =>
  api.get(`/devoluciones/ventas/${id}`).then((r) => r.data);

export const crearDevolucion = (data) =>
  api.post("/devoluciones", data).then((r) => r.data);
