const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const ESTADOS_PRODUCTO = ["ACTIVO", "INACTIVO", "DESCONTINUADO"];

const SUMAS = `
  COUNT(DISTINCT id_producto)::int AS productos,
  COALESCE(SUM(cantidad_total), 0)::numeric AS cantidad_total,
  COALESCE(SUM(cantidad_reservada), 0)::numeric AS cantidad_reservada,
  COALESCE(SUM(cantidad_vencida + cantidad_cuarentena), 0)::numeric AS cantidad_no_disponible,
  COALESCE(SUM(cantidad_disponible), 0)::numeric AS cantidad_disponible,
  COALESCE(SUM(valor_total), 0)::numeric AS valor_total`;

// RF44: existencias por almacén, categoría o marca, con cantidad total,
// reservada y disponible por producto y totales por almacén y por categoría.
const reporteExistencias = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.id(req.query.id_categoria, "id_categoria", "La categoría no es válida");
  filtros.id(req.query.id_marca, "id_marca", "La marca no es válida");
  filtros.opcion(
    req.query.estado,
    "estado_producto",
    ESTADOS_PRODUCTO,
    "El estado del producto no es válido",
  );

  const extra = req.query.solo_con_stock === "true" ? ["cantidad_total > 0"] : [];
  const whereSql = filtros.where(extra);
  const { valores } = filtros;

  const [detalle, resumen, porAlmacen, porCategoria] = await Promise.all([
    db.query(
      `SELECT * FROM vw_reporte_existencias ${whereSql}
       ORDER BY producto ASC, almacen ASC`,
      valores,
    ),
    db.query(
      `SELECT COUNT(*)::int AS registros, ${SUMAS}
       FROM vw_reporte_existencias ${whereSql}`,
      valores,
    ),
    db.query(
      `SELECT id_almacen, almacen_codigo, almacen, ${SUMAS}
       FROM vw_reporte_existencias ${whereSql}
       GROUP BY id_almacen, almacen_codigo, almacen
       ORDER BY almacen ASC`,
      valores,
    ),
    db.query(
      `SELECT id_categoria, categoria, ${SUMAS}
       FROM vw_reporte_existencias ${whereSql}
       GROUP BY id_categoria, categoria
       ORDER BY categoria ASC`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: detalle.rows,
    resumen: resumen.rows[0],
    por_almacen: porAlmacen.rows,
    por_categoria: porCategoria.rows,
  });
});

module.exports = { reporteExistencias };
