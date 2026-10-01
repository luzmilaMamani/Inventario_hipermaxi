import api from "./axios";
import { consultaStockPreview, esVistaPrevia } from "./preview";

export const consultarStock = (params) => {
  if (esVistaPrevia) return Promise.resolve(consultaStockPreview);
  return api.get("/stock/consulta", { params }).then((r) => r.data);
};