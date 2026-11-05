import api from "./axios";
import { alertasStockPreview, esVistaPrevia } from "./preview";

export const TIPOS_ALERTA = [
  { value: "PUNTO_REPOSICION", label: "Punto de reposición" },
  { value: "STOCK_MINIMO", label: "Stock mínimo" },
];

export const etiquetaTipoAlerta = (tipo) =>
  TIPOS_ALERTA.find((item) => item.value === tipo)?.label || tipo || "-";

export const listarAlertasStock = (params = {}) => {
  if (esVistaPrevia) {
    let data = [...alertasStockPreview.data];
    const estado = params.estado || "ABIERTA";
    if (estado !== "TODAS") data = data.filter((alerta) => alerta.estado === estado);
    if (params.tipo) data = data.filter((alerta) => alerta.tipo === params.tipo);
    if (params.id_almacen) {
      data = data.filter((alerta) => String(alerta.id_almacen) === String(params.id_almacen));
    }
    data.sort(
      (a, b) => new Date(b.fecha_alerta) - new Date(a.fecha_alerta) || b.id_alerta - a.id_alerta,
    );
    const page = Math.max(Number(params.page || 1), 1);
    const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
    return Promise.resolve({
      ok: true,
      data: data.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: data.length },
    });
  }
  return api.get("/alertas-stock", { params }).then((r) => r.data);
};
