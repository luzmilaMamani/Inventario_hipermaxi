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

export const listarAjustes = (params = {}) => {
  if (esVistaPrevia) {
    let data = ajustesPreview.data;
    if (params.motivo) data = data.filter((ajuste) => ajuste.motivo === params.motivo);
    if (params.search) {
      const texto = String(params.search).toLowerCase();
      data = data.filter((ajuste) =>
        [ajuste.numero_ajuste, ajuste.producto, ajuste.producto_codigo, ajuste.comentario]
          .join(" ")
          .toLowerCase()
          .includes(texto),
      );
    }
    return Promise.resolve({
      ok: true,
      data,
      pagination: { page: 1, limit: 20, total: data.length },
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
