const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const ESTADOS = [
  "SOLICITADA",
  "APROBADA",
  "RECHAZADA",
  "ENVIADA",
  "RECIBIDA",
  "RECIBIDA_CON_DIFERENCIAS",
  "CANCELADA",
];

// RF64: transferencias entre sucursales con origen, destino, estado, fechas y
// diferencias, y el tiempo promedio de entrega por ruta.
// Filtros: fecha_desde, fecha_hasta (sobre la fecha de solicitud), id_origen,
// id_destino, estado.
const reporteTransferencias = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.rangoFechas(req.query.fecha_desde, req.query.fecha_hasta, "fecha_solicitud");
  filtros.id(req.query.id_origen, "id_almacen_origen", "El almacén de origen no es válido");
  filtros.id(req.query.id_destino, "id_almacen_destino", "El almacén de destino no es válido");
  filtros.opcion(req.query.estado, "estado", ESTADOS, "El estado no es válido");
  const whereSql = filtros.where();
  const { valores } = filtros;

  const [detalle, resumen, porEstado, porRuta] = await Promise.all([
    db.query(
      `SELECT * FROM vw_reporte_transferencias ${whereSql}
       ORDER BY fecha_solicitud DESC, id_transferencia DESC`,
      valores,
    ),
    db.query(
      `SELECT COUNT(*)::int AS transferencias,
              COUNT(horas_entrega)::int AS recibidas,
              ROUND(AVG(horas_entrega), 1) AS horas_promedio,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a_tiempo) / NULLIF(COUNT(a_tiempo), 0), 1) AS porcentaje_a_tiempo,
              COUNT(*) FILTER (WHERE lineas_con_diferencia > 0)::int AS con_diferencias,
              COALESCE(SUM(unidades_enviadas), 0) AS unidades_enviadas,
              COALESCE(SUM(valor_diferencia), 0) AS valor_diferencia
       FROM vw_reporte_transferencias ${whereSql}`,
      valores,
    ),
    db.query(
      `SELECT estado, COUNT(*)::int AS cantidad
       FROM vw_reporte_transferencias ${whereSql}
       GROUP BY estado ORDER BY cantidad DESC`,
      valores,
    ),
    db.query(
      `SELECT id_almacen_origen, almacen_origen, id_almacen_destino, almacen_destino,
              COUNT(*)::int AS transferencias,
              COUNT(horas_entrega)::int AS recibidas,
              ROUND(AVG(horas_entrega), 1) AS horas_promedio,
              MIN(horas_entrega) AS horas_minimo,
              MAX(horas_entrega) AS horas_maximo,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a_tiempo) / NULLIF(COUNT(a_tiempo), 0), 1) AS porcentaje_a_tiempo,
              COALESCE(SUM(unidades_enviadas), 0) AS unidades_enviadas,
              COALESCE(SUM(diferencia_unidades), 0) AS diferencia_unidades
       FROM vw_reporte_transferencias ${whereSql}
       GROUP BY id_almacen_origen, almacen_origen, id_almacen_destino, almacen_destino
       ORDER BY transferencias DESC, almacen_origen, almacen_destino`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
    por_estado: porEstado.rows,
    por_ruta: porRuta.rows,
  });
});

module.exports = { reporteTransferencias };
