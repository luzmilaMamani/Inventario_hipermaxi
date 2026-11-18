import api from "./axios";

// RF44: existencias por almacén, categoría o marca.
export const reporteExistencias = (params) =>
  api.get("/reportes/existencias", { params }).then((r) => r.data);
