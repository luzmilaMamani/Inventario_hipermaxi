const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

const SUMAS = `
  COALESCE(SUM(productos), 0)::int AS registros,
  COALESCE(SUM(unidades), 0) AS unidades,
  COALESCE(SUM(valor_total), 0)::numeric(14, 2) AS valor_total,
  COALESCE(SUM(valor_disponible), 0)::numeric(14, 2) AS valor_disponible,
  COALESCE(SUM(valor_reservado), 0)::numeric(14, 2) AS valor_reservado,
  COALESCE(SUM(valor_no_disponible), 0)::numeric(14, 2) AS valor_no_disponible`;

// RF71: valor del inventario por sucursal (almacén) y total general, con
// desglose por categoría dentro de cada almacén. El valor se calcula igual que
// el reporte de existencias (stock × valor unitario del producto).
// Filtros: id_almacen, id_categoria, ciudad.
const reporteValorizacion = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.id(req.query.id_almacen, "id_almacen", "El almacén no es válido");
  filtros.id(req.query.id_categoria, "id_categoria", "La categoría no es válida");
  if (req.query.ciudad) filtros.agregar("ciudad = ?", String(req.query.ciudad));
  const whereSql = filtros.where();
  const { valores } = filtros;

  const [total, porAlmacen, desglose, porCategoria, porCiudad] = await Promise.all([
    db.query(`SELECT ${SUMAS} FROM vw_valorizacion_inventario ${whereSql}`, valores),
    db.query(
      `SELECT id_almacen, almacen_codigo, almacen, tipo_almacen, ciudad, ${SUMAS}
       FROM vw_valorizacion_inventario ${whereSql}
       GROUP BY id_almacen, almacen_codigo, almacen, tipo_almacen, ciudad
       ORDER BY valor_total DESC`,
      valores,
    ),
    db.query(
      `SELECT id_almacen, id_categoria, categoria, productos, unidades, valor_total,
              valor_disponible, valor_reservado, valor_no_disponible
       FROM vw_valorizacion_inventario ${whereSql}
       ORDER BY valor_total DESC`,
      valores,
    ),
    db.query(
      `SELECT id_categoria, categoria, ${SUMAS}
       FROM vw_valorizacion_inventario ${whereSql}
       GROUP BY id_categoria, categoria
       ORDER BY valor_total DESC`,
      valores,
    ),
    db.query(
      `SELECT ciudad, COUNT(DISTINCT id_almacen)::int AS almacenes, ${SUMAS}
       FROM vw_valorizacion_inventario ${whereSql}
       GROUP BY ciudad
       ORDER BY valor_total DESC`,
      valores,
    ),
  ]);

  const categoriasPorAlmacen = new Map();
  for (const fila of desglose.rows) {
    if (!categoriasPorAlmacen.has(fila.id_almacen)) categoriasPorAlmacen.set(fila.id_almacen, []);
    categoriasPorAlmacen.get(fila.id_almacen).push(fila);
  }

  res.json({
    ok: true,
    total: total.rows[0],
    por_almacen: porAlmacen.rows.map((a) => ({
      ...a,
      categorias: categoriasPorAlmacen.get(a.id_almacen) || [],
    })),
    por_categoria: porCategoria.rows,
    por_ciudad: porCiudad.rows,
  });
});

module.exports = { reporteValorizacion };
