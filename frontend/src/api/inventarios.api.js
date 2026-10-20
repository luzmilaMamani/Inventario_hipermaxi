import api from "./axios";

export const listarInventarios = () =>
  api.get("/inventarios").then((r) => r.data);

export const crearInventario = (data) =>
  api.post("/inventarios", data).then((r) => r.data);

export const registrarConteo = (id, data) =>
  api.post(`/inventarios/${id}/conteo`, data).then((r) => r.data);

export const obtenerComparativa = (id) =>
  api.get(`/inventarios/${id}/comparativa`).then((r) => r.data);

export const obtenerDiferencias = (id) =>
  api.get(`/inventarios/${id}/diferencias`).then((r) => r.data);

export const cerrarInventario = (id) =>
  api.put(`/inventarios/${id}/cerrar`).then((r) => r.data);