const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const TIPOS_PERDIDA = ["PERDIDA", "DANO", "VENCIMIENTO"];

const SUMAS = `
  COUNT(*)::int AS registros,
  COALESCE(SUM(cantidad), 0)::numeric AS unidades,
  COALESCE(SUM(valor_total), 0)::numeric AS valor`;

// RF46: pérdidas de inventario (pérdida, daño y vencimiento) con cantidad y
// valor perdido por producto, tipo y motivo.
// Filtros: fecha_desde, fecha_hasta, id_almacen, id_categoria, tipo, motivo.
const reportePerdidas = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.rangoFechas(req.query.fecha_desde, req.query.fecha_hasta, "fecha_salida");
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.id(req.query.id_categoria, "id_categoria", "La categoría no es válida");
  filtros.opcion(req.query.tipo, "tipo_perdida", TIPOS_PERDIDA, "El tipo de pérdida no es válido");
  // subtipo_perdida se mantiene por compatibilidad con la pantalla anterior.
  const motivo = req.query.motivo || req.query.subtipo_perdida;
  if (motivo) filtros.agregar("motivo = ?", String(motivo).toUpperCase());

  const whereSql = filtros.where();
  const { valores } = filtros;

  const [detalle, resumen, porTipo, porMotivo, porProducto] = await Promise.all([
    db.query(`SELECT * FROM vw_reporte_perdidas ${whereSql} ORDER BY fecha_salida DESC, id_salida DESC`, valores),
    db.query(
      `SELECT COUNT(*)::int AS total_registros,
              COUNT(DISTINCT id_salida)::int AS total_salidas,
              COALESCE(SUM(cantidad), 0)::numeric AS total_unidades,
              COALESCE(SUM(valor_total), 0)::numeric AS total_valorizado
       FROM vw_reporte_perdidas ${whereSql}`,
      valores,
    ),
    db.query(
      `SELECT tipo_perdida, ${SUMAS}
       FROM vw_reporte_perdidas ${whereSql}
       GROUP BY tipo_perdida ORDER BY valor DESC`,
      valores,
    ),
    db.query(
      `SELECT tipo_perdida, motivo, ${SUMAS}
       FROM vw_reporte_perdidas ${whereSql}
       GROUP BY tipo_perdida, motivo ORDER BY valor DESC`,
      valores,
    ),
    db.query(
      `SELECT id_producto, producto_codigo, producto, categoria, unidad, ${SUMAS}
       FROM vw_reporte_perdidas ${whereSql}
       GROUP BY id_producto, producto_codigo, producto, categoria, unidad
       ORDER BY valor DESC, producto
       LIMIT 10`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
    por_tipo: porTipo.rows,
    por_motivo: porMotivo.rows,
    por_producto: porProducto.rows,
  });
});

module.exports = { reportePerdidas, TIPOS_PERDIDA };
