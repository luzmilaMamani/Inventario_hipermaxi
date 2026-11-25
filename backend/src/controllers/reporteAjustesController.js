const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const MOTIVOS = ["CONTEO_FISICO", "MERMA", "DANO", "ERROR_REGISTRO", "VENCIMIENTO", "OTRO"];

const SUMAS = `
  COUNT(*)::int AS registros,
  COALESCE(SUM(ABS(diferencia)), 0)::numeric AS unidades,
  COALESCE(SUM(valor_ajuste), 0)::numeric AS valor`;

// Reporte de auditoría: ajustes por período y responsable, con justificación,
// aprobador y valor. Totales por responsable y por motivo.
// Filtros: fecha_desde, fecha_hasta, id_usuario (responsable), id_almacen, motivo.
// todos=true devuelve el filtro completo para exportar.
const reporteAjustes = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.rangoFechas(req.query.fecha_desde, req.query.fecha_hasta, "fecha_ajuste");
  filtros.id(req.query.id_usuario, "id_usuario", "El responsable no es válido");
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.opcion(req.query.motivo, "motivo", MOTIVOS, "El motivo no es válido");

  const whereSql = filtros.where();
  const { valores } = filtros;
  const todos = req.query.todos === "true";
  const limit = todos ? 100000 : Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const page = todos ? 1 : Math.max(Number(req.query.page) || 1, 1);

  const [detalle, resumen, porResponsable, porMotivo] = await Promise.all([
    db.query(
      `SELECT * FROM vw_reporte_ajustes ${whereSql}
       ORDER BY fecha_ajuste DESC, id_ajuste DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, (page - 1) * limit],
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS registros,
         COALESCE(SUM(ABS(diferencia)), 0)::numeric AS unidades,
         COALESCE(SUM(valor_ajuste), 0)::numeric AS valor_total,
         COUNT(*) FILTER (WHERE estado IN ('APLICADO', 'APROBADO'))::int AS aplicados,
         COALESCE(SUM(valor_ajuste) FILTER (WHERE estado IN ('APLICADO', 'APROBADO')), 0)::numeric AS valor_aplicado,
         COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
         COUNT(*) FILTER (WHERE estado = 'RECHAZADO')::int AS rechazados
       FROM vw_reporte_ajustes ${whereSql}`,
      valores,
    ),
    db.query(
      `SELECT id_usuario, responsable, ${SUMAS}
       FROM vw_reporte_ajustes ${whereSql}
       GROUP BY id_usuario, responsable
       ORDER BY valor DESC, responsable ASC`,
      valores,
    ),
    db.query(
      `SELECT motivo, ${SUMAS}
       FROM vw_reporte_ajustes ${whereSql}
       GROUP BY motivo
       ORDER BY valor DESC, motivo ASC`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
    por_responsable: porResponsable.rows,
    por_motivo: porMotivo.rows,
    pagination: { page, limit, total: resumen.rows[0].registros },
  });
});

module.exports = { reporteAjustes };
