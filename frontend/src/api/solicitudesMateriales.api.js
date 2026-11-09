import api from "./axios";

// HIP-259 / HIP-260: integración con Producción y Logística.
export const ESTADOS_SOLICITUD = {
  RESERVADA: { label: "Reservada", clase: "bg-blue-100 text-blue-700" },
  PARCIAL: { label: "Reserva parcial", clase: "bg-amber-100 text-amber-700" },
  RECHAZADA: { label: "Rechazada", clase: "bg-red-100 text-red-700" },
  DESPACHADA: { label: "Despachada", clase: "bg-green-100 text-green-700" },
};

export const ESTADOS_EVENTO = {
  PENDIENTE: { label: "Pendiente de envío", clase: "bg-amber-100 text-amber-700" },
  PUBLICADO: { label: "Publicado", clase: "bg-green-100 text-green-700" },
  ERROR: { label: "Error de envío", clase: "bg-red-100 text-red-700" },
};

export const listarSolicitudesMateriales = (params) =>
  api.get("/solicitudes-materiales", { params }).then((r) => r.data);

export const obtenerSolicitudMaterial = (id) =>
  api.get(`/solicitudes-materiales/${id}`).then((r) => r.data);

export const despacharSolicitudMaterial = (id) =>
  api.post(`/solicitudes-materiales/${id}/despachar`).then((r) => r.data);

export const listarEventosIntegracion = (params) =>
  api.get("/solicitudes-materiales/eventos", { params }).then((r) => r.data);

export const simularSolicitudLogistica = (data) =>
  api.post("/solicitudes-materiales/simular/solicitud", data).then((r) => r.data);

export const simularProductoTerminado = (data) =>
  api.post("/solicitudes-materiales/simular/terminados", data).then((r) => r.data);
