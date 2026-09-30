import api from "./axios";

// ---------- CATEGORÍAS ----------
export const listarCategoriasAdmin = (params) =>
  api.get("/categorias", { params }).then((r) => r.data);

export const crearCategoria = (data) =>
  api.post("/categorias", data).then((r) => r.data);

export const actualizarCategoria = (id, data) =>
  api.put(`/categorias/${id}`, data).then((r) => r.data);

export const eliminarCategoria = (id) =>
  api.delete(`/categorias/${id}`).then((r) => r.data);

// ---------- SUBCATEGORÍAS ----------
export const listarSubcategoriasAdmin = (params) =>
  api.get("/subcategorias", { params }).then((r) => r.data);

export const crearSubcategoria = (data) =>
  api.post("/subcategorias", data).then((r) => r.data);

export const actualizarSubcategoria = (id, data) =>
  api.put(`/subcategorias/${id}`, data).then((r) => r.data);

export const eliminarSubcategoria = (id) =>
  api.delete(`/subcategorias/${id}`).then((r) => r.data);

// ---------- MARCAS ----------
export const listarMarcasAdmin = (params) =>
  api.get("/marcas", { params }).then((r) => r.data);

export const crearMarca = (data) =>
  api.post("/marcas", data).then((r) => r.data);

export const actualizarMarca = (id, data) =>
  api.put(`/marcas/${id}`, data).then((r) => r.data);

export const eliminarMarca = (id) =>
  api.delete(`/marcas/${id}`).then((r) => r.data);