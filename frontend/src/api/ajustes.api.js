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
