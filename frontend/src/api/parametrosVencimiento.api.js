import api from "./axios";
import { esVistaPrevia } from "./preview";

const parametrosPreview = {
  ok: true,
  data: {
    general: { dias_anticipacion: 30, fecha_actualizacion: null },
    categorias: [],
  },
};

export const listarParametrosVencimiento = () => {
  if (esVistaPrevia) return Promise.resolve(parametrosPreview);
  return api.get("/parametros-vencimiento").then((r) => r.data);
};

export const actualizarParametroGeneral = (dias_anticipacion) =>
  api
    .put("/parametros-vencimiento/general", { dias_anticipacion })
    .then((r) => r.data);

export const guardarParametroCategoria = (id_categoria, dias_anticipacion) =>
  api
    .put(`/parametros-vencimiento/categorias/${id_categoria}`, {
      dias_anticipacion,
    })
    .then((r) => r.data);

export const eliminarParametroCategoria = (id_categoria) =>
  api
    .delete(`/parametros-vencimiento/categorias/${id_categoria}`)
    .then((r) => r.data);
