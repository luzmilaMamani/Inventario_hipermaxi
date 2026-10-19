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
        id_entrada: 1,
        numero_entrada: "ENT-VISTA-PREVIA",
        proveedor: data.proveedor,
        resultado_verificacion: resultado,
        detalles,
      },
    });
  }
  return api.post("/entradas-inventario", data).then((r) => r.data);
};

export const listarRecepciones = (params) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      data: [],
      pagination: { page: 1, limit: 8, total: 0 },
    });
  }
  return api.get("/entradas-inventario", { params }).then((r) => r.data);
};

export const obtenerRecepcion = (id) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      data: {
        id_entrada: Number(id),
        numero_entrada: "ENT-VISTA-PREVIA",
        proveedor: "Proveedor de muestra",
        almacen: "Sucursal Centro",
        almacen_codigo: "SUC-01",
        fecha_entrada: new Date().toISOString(),
        resultado_verificacion: "CON_DIFERENCIA",
        detalles: [
          {
            id_detalle_entrada: 1,
            id_producto: 1,
            producto_codigo: "ARZ-001",
            producto: "Arroz extra",
            cantidad_solicitada: 10,
            cantidad_recibida: 8,
            estado_verificacion: "CON_DIFERENCIA",
          },
        ],
        diferencias: [],
      },
    });
  }
  return api.get(`/entradas-inventario/${id}`).then((r) => r.data);
};

export const registrarDiferencia = (idEntrada, data) => {
  if (esVistaPrevia) {
    return Promise.resolve({
      ok: true,
      message: "Diferencia registrada en vista previa",
      data: {
        id_diferencia: Date.now(),
        ...data,
        fecha_registro: new Date().toISOString(),
        usuario: "Vista previa",
      },
    });
  }
  return api.post(`/entradas-inventario/${idEntrada}/diferencias`, data).then((r) => r.data);
};
