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
