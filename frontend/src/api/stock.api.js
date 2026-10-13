import api from "./axios";
import {
  consultaStockPreview,
  esVistaPrevia,
  historialStockPreview,
} from "./preview";

export const consultarStock = (params) => {
  if (esVistaPrevia) return Promise.resolve(consultaStockPreview);
  return api.get("/stock/consulta", { params }).then((r) => r.data);
};

export const consultarHistorialStock = (productoId, params) => {
  if (esVistaPrevia) return Promise.resolve(historialStockPreview);
  return api
    .get(`/stock/historial/${productoId}`, { params })
    .then((r) => r.data);
};