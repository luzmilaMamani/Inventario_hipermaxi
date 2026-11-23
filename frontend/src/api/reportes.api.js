import api from "./axios";

// RF44: existencias por almacén, categoría o marca.
export const reporteExistencias = (params) =>
  api.get("/reportes/existencias", { params }).then((r) => r.data);

// Stock bajo: disponible contra stock mínimo (RF13) y punto de reposición (RF15).
export const reporteStockBajo = (params) =>
  api.get("/reportes/stock-bajo", { params }).then((r) => r.data);

// Ajustes por período y responsable, con justificación, aprobador y valor.
export const reporteAjustes = (params) =>
  api.get("/reportes/ajustes", { params }).then((r) => r.data);

// Kardex valorizado de un producto por costo promedio ponderado.
export const reporteKardex = (params) =>
  api.get("/reportes/kardex", { params }).then((r) => r.data);

// RF67: stock disponible de los productos en cada sucursal.
export const reporteComparativoSucursales = (params) =>
  api.get("/reportes/comparativo-sucursales", { params }).then((r) => r.data);

// RF62: los 7 indicadores principales del inventario.
export const consultarIndicadores = (params) =>
  api.get("/reportes/indicadores", { params }).then((r) => r.data);

export const guardarMetaKpi = (body) =>
  api.put("/reportes/indicadores/metas", body).then((r) => r.data);

// RF63: lotes vencidos y próximos a vencer, valorizados.
export const reporteVencimientosLotes = (params) =>
  api.get("/reportes/vencimientos-lotes", { params }).then((r) => r.data);

// RF64: transferencias entre sucursales y tiempos de entrega.
export const reporteTransferencias = (params) =>
  api.get("/reportes/transferencias", { params }).then((r) => r.data);

// RF71: valorización del inventario por sucursal, almacén y categoría.
export const reporteValorizacion = (params) =>
  api.get("/reportes/valorizacion", { params }).then((r) => r.data);

// RF45: movimientos de inventario por período (paginado).
export const reporteMovimientos = (params) =>
  api.get("/reportes/movimientos", { params }).then((r) => r.data);

// RF65: rotación de productos y días de inventario.
export const reporteRotacion = (params) =>
  api.get("/reportes/rotacion", { params }).then((r) => r.data);

// RF69: cumplimiento de proveedores según las diferencias en recepciones.
export const reporteCumplimientoProveedores = (params) =>
  api.get("/reportes/cumplimiento-proveedores", { params }).then((r) => r.data);
