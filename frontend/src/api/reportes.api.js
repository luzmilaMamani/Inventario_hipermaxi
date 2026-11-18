import api from "./axios";

// RF44: existencias por almacén, categoría o marca.
export const reporteExistencias = (params) =>
  api.get("/reportes/existencias", { params }).then((r) => r.data);

// RF67: stock disponible de los productos en cada sucursal.
export const reporteComparativoSucursales = (params) =>
  api.get("/reportes/comparativo-sucursales", { params }).then((r) => r.data);
