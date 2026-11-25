const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { crearFiltros } = require("../utils/filtrosReporte");

const NIVELES = {
  BAJO_MINIMO: "bajo_minimo = TRUE",
  PUNTO_REPOSICION: "en_punto_reposicion = TRUE",
};

// Reporte para compras y supervisión: productos cuya cantidad disponible está
// en el stock mínimo o en el punto de reposición, con la cantidad a reponer.
// Filtros: id_almacen, id_categoria, nivel (BAJO_MINIMO | PUNTO_REPOSICION).
// todos=true devuelve el filtro completo para exportar.
const reporteStockBajo = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.id(req.query.id_categoria, "id_categoria", "La categoría no es válida");

  const extra = [];
  if (req.query.nivel !== undefined && req.query.nivel !== null && req.query.nivel !== "") {
    const condicion = NIVELES[req.query.nivel];
    if (!condicion) throw new ApiError(400, "El nivel no es válido");
    extra.push(condicion);
  }

  const whereSql = filtros.where(extra);
  const { valores } = filtros;
  const todos = req.query.todos === "true";
  const limit = todos ? 100000 : Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const page = todos ? 1 : Math.max(Number(req.query.page) || 1, 1);

  const [detalle, resumen] = await Promise.all([
    db.query(
      `SELECT * FROM vw_reporte_stock_bajo ${whereSql}
       ORDER BY bajo_minimo DESC, cantidad_disponible ASC, cantidad_sugerida DESC, producto ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, (page - 1) * limit],
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS registros,
         COUNT(*) FILTER (WHERE bajo_minimo)::int AS bajo_minimo,
         COUNT(*) FILTER (WHERE en_punto_reposicion)::int AS en_punto_reposicion,
         COALESCE(SUM(cantidad_sugerida), 0)::numeric AS cantidad_sugerida
       FROM vw_reporte_stock_bajo ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
    pagination: { page, limit, total: resumen.rows[0].registros },
  });
});

module.exports = { reporteStockBajo };
