import api from "./axios";

export const listarCategorias = () =>
  api.get("/catalogos/categorias").then((r) => r.data);

export const listarSubcategorias = (id_categoria) =>
  api
    .get("/catalogos/subcategorias", { params: { id_categoria } })
    .then((r) => r.data);

export const listarMarcas = () =>
  api.get("/catalogos/marcas").then((r) => r.data);

export const listarUnidadesMedida = () =>
  api.get("/catalogos/unidades-medida").then((r) => r.data);

export const listarAlmacenes = () =>
  api.get("/catalogos/almacenes").then((r) => r.data);