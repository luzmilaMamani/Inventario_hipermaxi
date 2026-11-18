const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const GRUPOS = ["ENTRADA", "SALIDA", "TRANSFERENCIA", "AJUSTE"];

// RF45: movimientos de inventario de un período para auditar qué pasó con el
// stock. Paginado; los totales por tipo cubren todo el filtro.
// Filtros: fecha_desde, fecha_hasta, tipo (ENTRADA, SALIDA, TRANSFERENCIA,
// AJUSTE), id_almacen, id_producto, search (producto o referencia).
// Con todos=true devuelve hasta 5000 filas sin paginar (para exportar).
const reporteMovimientos = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.rangoFechas(req.query.fecha_desde, req.query.fecha_hasta, "fecha_movimiento");
  filtros.opcion(req.query.tipo, "grupo", GRUPOS, "El tipo de movimiento no es válido");
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.id(req.query.id_producto, "id_producto", "El producto no es válido");
  if (req.query.search) {
    filtros.agregar(
      "(producto ILIKE ? OR producto_codigo ILIKE ? OR referencia ILIKE ?)",
      `%${String(req.query.search).trim()}%`,
    );
  }
  const whereSql = filtros.where();
  const { valores } = filtros;

  const todos = req.query.todos === "true";
  const limit = todos ? 5000 : Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const page = todos ? 1 : Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const [detalle, porTipo, total] = await Promise.all([
    db.query(
      `SELECT * FROM vw_reporte_movimientos ${whereSql}
       ORDER BY fecha_movimiento DESC, id_movimiento DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT grupo,
              COUNT(*)::int AS movimientos,
              COALESCE(SUM(cantidad) FILTER (WHERE sentido = 'INGRESO'), 0) AS unidades_ingreso,
              COALESCE(SUM(cantidad) FILTER (WHERE sentido = 'EGRESO'), 0) AS unidades_egreso,
              COALESCE(SUM(valor), 0)::numeric(14, 2) AS valor
       FROM vw_reporte_movimientos ${whereSql}
       GROUP BY grupo
       ORDER BY movimientos DESC`,
      valores,
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM vw_reporte_movimientos ${whereSql}`, valores),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    totales_por_tipo: porTipo.rows,
    pagination: { page, limit, total: total.rows[0].total },
  });
});

module.exports = { reporteMovimientos, GRUPOS };
