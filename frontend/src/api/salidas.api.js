import api from "./axios";

export const listarSalidas = (params) =>
  api.get("/salidas", { params }).then((r) => r.data);

export const obtenerSalida = (id) =>
  api.get(`/salidas/${id}`).then((r) => r.data);

export const crearSalida = (data) =>
  api.post("/salidas", data).then((r) => r.data);

export const reportePerdidas = (params) =>
  api.get("/reportes/perdidas", { params }).then((r) => r.data);

export const reporteDanos = (params) =>
  api.get("/reportes/danos", { params }).then((r) => r.data);

export const reporteVencimientos = (params) =>
  api.get("/reportes/vencimientos", { params }).then((r) => r.data);
