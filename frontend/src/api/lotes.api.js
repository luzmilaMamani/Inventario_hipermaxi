import api from "./axios";
import { esVistaPrevia } from "./preview";

export const listarLotes = (params) => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, data: [], pagination: { page: 1, limit: 20, total: 0 } });
  }
  return api.get("/lotes", { params }).then((r) => r.data);
};

export const historialCuarentena = (idLote) =>
  api.get(`/lotes/${idLote}/cuarentena`).then((r) => r.data);

export const ponerEnCuarentena = (idLote, motivo) =>
  api.post(`/lotes/${idLote}/cuarentena`, { motivo }).then((r) => r.data);

export const liberarCuarentena = (idLote, motivo) =>
  api.post(`/lotes/${idLote}/liberar`, { motivo }).then((r) => r.data);
