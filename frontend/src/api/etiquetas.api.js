import api from "./axios";
import { esVistaPrevia } from "./preview";

export const buscarProductosEtiquetables = (search) => {
  if (esVistaPrevia) return Promise.resolve({ ok: true, data: [] });
  return api
    .get("/etiquetas/productos", { params: { search, limit: 20 } })
    .then((r) => r.data);
};

// Devuelve el PDF como Blob. Si el backend responde con error, el cuerpo
// también llega como Blob: se convierte a JSON para mostrar su mensaje.
export const generarPdfEtiquetas = async (items, posicion_inicial = 0) => {
  try {
    const respuesta = await api.post(
      "/etiquetas/pdf",
      { items, posicion_inicial },
      { responseType: "blob" },
    );
    return respuesta.data;
  } catch (error) {
    const datos = error.response?.data;
    if (datos instanceof Blob) {
      try {
        error.response.data = JSON.parse(await datos.text());
      } catch {
        // Se conserva el error original si el cuerpo no es JSON.
      }
    }
    throw error;
  }
};
