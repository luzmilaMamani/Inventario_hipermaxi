import api from "./axios";
import { ajustesPreview, esVistaPrevia } from "./preview";

export const MOTIVOS_AJUSTE = [
  { value: "CONTEO_FISICO", label: "Conteo físico" },
  { value: "MERMA", label: "Merma" },
  { value: "DANO", label: "Daño" },
  { value: "ERROR_REGISTRO", label: "Error de registro" },
  { value: "VENCIMIENTO", label: "Vencimiento" },
  { value: "OTRO", label: "Otro" },
];

export const etiquetaMotivo = (motivo) =>
  MOTIVOS_AJUSTE.find((item) => item.value === motivo)?.label || motivo || "-";

function fechaDeAjuste(ajuste) {
  return String(ajuste.fecha_ajuste || "").slice(0, 10);
}

export const listarAjustes = (params = {}) => {
  if (esVistaPrevia) {
    let data = [...ajustesPreview.data];
    if (params.motivo) data = data.filter((ajuste) => ajuste.motivo === params.motivo);
    if (params.id_almacen) {
      data = data.filter((ajuste) => String(ajuste.id_almacen) === String(params.id_almacen));
    }
    if (params.id_producto) {
      data = data.filter((ajuste) => String(ajuste.id_producto) === String(params.id_producto));
    }
    if (params.id_usuario) {
      data = data.filter(
        (ajuste) =>
          String(ajuste.id_usuario) === String(params.id_usuario) ||
          String(ajuste.id_usuario_aprueba) === String(params.id_usuario),
      );
    }
    if (params.fecha_desde) {
      data = data.filter((ajuste) => fechaDeAjuste(ajuste) >= params.fecha_desde);
    }
    if (params.fecha_hasta) {
      data = data.filter((ajuste) => fechaDeAjuste(ajuste) <= params.fecha_hasta);
    }
    if (params.search) {
      const texto = String(params.search).toLowerCase();
      data = data.filter((ajuste) =>
        [ajuste.numero_ajuste, ajuste.producto, ajuste.producto_codigo, ajuste.comentario]
          .join(" ")
          .toLowerCase()
          .includes(texto),
      );
    }
    data.sort(
      (a, b) =>
        new Date(b.fecha_ajuste) - new Date(a.fecha_ajuste) || b.id_ajuste - a.id_ajuste,
    );
    const page = Math.max(Number(params.page || 1), 1);
    const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
    return Promise.resolve({
      ok: true,
      data: data.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: data.length },
    });
  }
  return api.get("/ajustes-inventario", { params }).then((r) => r.data);
};

export const obtenerAjuste = (id) => {
  if (esVistaPrevia) {
    const ajuste = ajustesPreview.data.find((item) => Number(item.id_ajuste) === Number(id));
    if (!ajuste) {
      return Promise.reject({ response: { data: { message: "Ajuste no encontrado" } } });
    }
    return Promise.resolve({ ok: true, data: ajuste });
  }
  return api.get(`/ajustes-inventario/${id}`).then((r) => r.data);
};

export const crearAjuste = (data) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      message: "Ajuste aplicado. La justificación quedó registrada y no se puede modificar.",
      data: { id_ajuste: Date.now(), ...data, estado: "APLICADO" },
    });
  }
  return api.post("/ajustes-inventario", data).then((r) => r.data);
};

// RF53: estados del ajuste y aprobación de los que superan el límite.
export const ESTADOS_AJUSTE = [
  { value: "APLICADO", label: "Aplicado" },
  { value: "PENDIENTE", label: "Pendiente de aprobación" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "RECHAZADO", label: "Rechazado" },
];

export const ESTILO_ESTADO_AJUSTE = {
  APLICADO: "bg-green-100 text-green-700",
  PENDIENTE: "bg-amber-100 text-amber-800",
  APROBADO: "bg-blue-100 text-blue-700",
  RECHAZADO: "bg-red-100 text-red-700",
};

export const etiquetaEstadoAjuste = (estado) =>
  ESTADOS_AJUSTE.find((item) => item.value === estado)?.label || estado || "-";

export const EVENTO_AJUSTES_PENDIENTES = "ajustes-pendientes-cambio";

export const notificarCambioAjustesPendientes = () =>
  window.dispatchEvent(new Event(EVENTO_AJUSTES_PENDIENTES));

const LIMITES_PREVIEW = { limite_cantidad: 50, limite_monto: 1000 };

export const aprobarAjuste = (id) => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, message: "Ajuste aprobado y stock actualizado" });
  }
  return api.post(`/ajustes-inventario/${id}/aprobar`).then((r) => r.data);
};

export const rechazarAjuste = (id, motivo_rechazo) => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, message: "Ajuste rechazado. El stock no se modificó." });
  }
  return api
    .post(`/ajustes-inventario/${id}/rechazar`, { motivo_rechazo })
    .then((r) => r.data);
};

export const resumenAjustesPendientes = () => {
  if (esVistaPrevia) return Promise.resolve({ ok: true, data: { pendientes: 0 } });
  return api.get("/ajustes-inventario/pendientes/resumen").then((r) => r.data);
};

export const obtenerLimitesAprobacion = () => {
  if (esVistaPrevia) return Promise.resolve({ ok: true, data: LIMITES_PREVIEW });
  return api.get("/ajustes-inventario/limites").then((r) => r.data);
};

export const actualizarLimitesAprobacion = (data) => {
  if (esVistaPrevia) {
    return Promise.resolve({ ok: true, message: "Límites de aprobación actualizados", data });
  }
  return api.put("/ajustes-inventario/limites", data).then((r) => r.data);
};
