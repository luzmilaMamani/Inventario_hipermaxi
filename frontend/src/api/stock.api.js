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
export const consultarProximosVencer = (params) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });
  }
  return api.get("/stock/proximos-vencer", { params }).then((r) => r.data);
};

// RF43: lotes vencidos separados del stock disponible, pendientes de baja.
export const consultarLotesVencidos = (params) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      data: [],
      resumen: { total_lotes: 0, total_unidades: 0, total_valor: 0 },
      pagination: { page: 1, limit: 20, total: 0 },
    });
  }
  return api.get("/stock/vencidos", { params }).then((r) => r.data);
};
