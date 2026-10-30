import api from "./axios";
import { esVistaPrevia } from "./preview";

export const registrarRecepcion = (data) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      message: "Recepción registrada en vista previa",
      data: {
        numero_entrada: "ENT-VISTA-PREVIA",
        proveedor: data.proveedor,
      },
    });
  }
  return api.post("/entradas-inventario", data).then((r) => r.data);
};

export const listarRecepciones = (params) =>
  api.get("/entradas-inventario", { params }).then((r) => r.data);

export const obtenerRecepcion = (id) =>
  api.get(`/entradas-inventario/${id}`).then((r) => r.data);
