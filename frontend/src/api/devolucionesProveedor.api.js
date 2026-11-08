import api from "./axios";

// RF56: devoluciones a proveedor de mercadería defectuosa.
export const ESTADOS_REPOSICION = {
  PENDIENTE: { label: "Pendiente", clase: "bg-amber-100 text-amber-700" },
  REPUESTA: { label: "Repuesta", clase: "bg-green-100 text-green-700" },
  SIN_REPOSICION: { label: "Sin reposición", clase: "bg-gray-200 text-gray-700" },
};

export const listarDevolucionesProveedor = (params) =>
  api.get("/devoluciones-proveedor", { params }).then((r) => r.data);

export const obtenerDevolucionProveedor = (id) =>
  api.get(`/devoluciones-proveedor/${id}`).then((r) => r.data);

export const buscarRecepcionesDevolvibles = (search) =>
  api.get("/devoluciones-proveedor/recepciones", { params: { search } }).then((r) => r.data);

export const obtenerRecepcionDevolvible = (id) =>
  api.get(`/devoluciones-proveedor/recepciones/${id}`).then((r) => r.data);

export const crearDevolucionProveedor = (data) =>
  api.post("/devoluciones-proveedor", data).then((r) => r.data);

export const registrarReposicion = (id, data) =>
  api.put(`/devoluciones-proveedor/${id}/reposicion`, data).then((r) => r.data);
