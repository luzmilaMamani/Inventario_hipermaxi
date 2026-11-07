import api from "./axios";
import { esVistaPrevia } from "./preview";

export const TIPOS_ALERTA_VENCIMIENTO = [
  { value: "VENCIDO", label: "Vencido" },
  { value: "POR_VENCER", label: "Por vencer" },
];

export const etiquetaTipoVencimiento = (tipo) =>
  TIPOS_ALERTA_VENCIMIENTO.find((item) => item.value === tipo)?.label || tipo || "-";

// Evento para que el indicador del menú se actualice al marcar alertas como leídas.
export const EVENTO_ALERTAS_VENCIMIENTO = "alertas-vencimiento:actualizadas";

export const notificarCambioAlertas = () =>
  window.dispatchEvent(new Event(EVENTO_ALERTAS_VENCIMIENTO));

export const listarAlertasVencimiento = (params = {}) => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, data: [], pagination: { page: 1, limit: 20, total: 0 } });
  }
  return api.get("/alertas-vencimiento", { params }).then((r) => r.data);
};

export const resumenAlertasVencimiento = () => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, data: { por_vencer: 0, vencidas: 0, pendientes: 0 } });
  }
  return api.get("/alertas-vencimiento/resumen").then((r) => r.data);
};

export const marcarAlertaVencimientoLeida = (id) =>
  api.put(`/alertas-vencimiento/${id}/leida`).then((r) => r.data);

// Sin ids marca todas las pendientes.
export const marcarAlertasVencimientoLeidas = (ids) =>
  api.put("/alertas-vencimiento/leidas", ids ? { ids } : {}).then((r) => r.data);

export const generarAlertasVencimiento = () =>
  api.post("/alertas-vencimiento/generar").then((r) => r.data);
