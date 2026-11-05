import api from "./axios";

export const registrarDiferencia = (data) =>
  api.post("/diferencias", data).then((r) => r.data);

export const listarDiferenciasPorEntrada = (id_entrada) =>
  api.get(`/diferencias/entrada/${id_entrada}`).then((r) => r.data);