import api from "./axios";
import { esVistaPrevia } from "./preview";

export const registrarRecepcion = (data) => {
  if (esVistaPrevia) {
    const detalles = (data.detalles || []).map((detalle) => {
      const esperada = Number(detalle.cantidad_solicitada ?? detalle.cantidad_recibida);
      const recibida = Number(detalle.cantidad_recibida);
      return {
        ...detalle,
        cantidad_solicitada: esperada,
        cantidad_recibida: recibida,
        estado_verificacion: esperada === recibida ? "CONFORME" : "CON_DIFERENCIA",
      };
    });
    const resultado = detalles.every((detalle) => detalle.estado_verificacion === "CONFORME")
      ? "CONFORME"
      : "CON_DIFERENCIA";

    return Promise.resolve({
      ok: true,
      message: "Recepción registrada en vista previa",
      data: {
        numero_entrada: "ENT-VISTA-PREVIA",
        proveedor: data.proveedor,
        resultado_verificacion: resultado,
        detalles,
      },
    });
  }
  return api.post("/entradas-inventario", data).then((r) => r.data);
};
