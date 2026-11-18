const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { crearFiltros } = require("../utils/filtrosReporte");

// RF69: cumplimiento de cada proveedor según las diferencias registradas en sus
// recepciones (RF20 y RF21).
//  - % de cumplimiento = recepciones sin diferencia / recepciones.
//  - % de entrega      = unidades recibidas (sin contar sobrantes) / solicitadas.
// Filtros: fecha_desde, fecha_hasta, proveedor, id_almacen.
const reporteCumplimientoProveedores = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.rangoFechas(req.query.fecha_desde, req.query.fecha_hasta, "r.fecha_entrada");
  filtros.id(req.query.id_almacen, "r.id_almacen", "El almacén no es válido");
  if (req.query.proveedor) filtros.agregar("r.proveedor = ?", String(req.query.proveedor));
  const whereSql = filtros.where();
  const { valores } = filtros;

  const [porProveedor, detalle] = await Promise.all([
    db.query(
      `SELECT r.proveedor,
              COUNT(*)::int AS recepciones,
              COUNT(*) FILTER (WHERE r.sin_diferencia)::int AS sin_diferencia,
              COUNT(*) FILTER (WHERE NOT r.sin_diferencia)::int AS con_diferencia,
              ROUND(100.0 * COUNT(*) FILTER (WHERE r.sin_diferencia) / NULLIF(COUNT(*), 0), 1) AS porcentaje_cumplimiento,
              SUM(r.lineas)::int AS lineas,
              SUM(r.lineas_con_diferencia)::int AS lineas_con_diferencia,
              SUM(r.cantidad_solicitada) AS unidades_solicitadas,
              SUM(r.cantidad_recibida) AS unidades_recibidas,
              SUM(d.faltante) AS unidades_faltantes,
              SUM(d.sobrante) AS unidades_sobrantes,
              ROUND(100.0 * (SUM(r.cantidad_recibida) - SUM(d.sobrante)) / NULLIF(SUM(r.cantidad_solicitada), 0), 1) AS porcentaje_entrega,
              MAX(r.fecha_entrada) AS ultima_recepcion
       FROM vw_recepciones_cumplimiento r
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(-de.diferencia) FILTER (WHERE de.diferencia < 0), 0) AS faltante,
                COALESCE(SUM(de.diferencia) FILTER (WHERE de.diferencia > 0), 0) AS sobrante
         FROM detalle_entradas de WHERE de.id_entrada = r.id_entrada
       ) d
       ${whereSql}
       GROUP BY r.proveedor
       ORDER BY porcentaje_cumplimiento ASC NULLS LAST, recepciones DESC`,
      valores,
    ),
    db.query(
      `SELECT r.id_entrada, r.numero_entrada, r.fecha_entrada, r.proveedor,
              a.nombre AS almacen,
              p.codigo AS producto_codigo, p.nombre AS producto, um.abreviatura AS unidad,
              de.cantidad_solicitada, de.cantidad_recibida, de.diferencia,
              CASE WHEN de.diferencia < 0 THEN 'FALTANTE' ELSE 'SOBRANTE' END AS tipo,
              (de.diferencia * COALESCE(p.precio, 0))::numeric(14, 2) AS valor_diferencia,
              de.observaciones
       FROM vw_recepciones_cumplimiento r
       INNER JOIN detalle_entradas de ON de.id_entrada = r.id_entrada
       INNER JOIN productos p ON p.id_producto = de.id_producto
       INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
       INNER JOIN almacenes a ON a.id_almacen = r.id_almacen
       ${filtros.where(["de.diferencia <> 0"])}
       ORDER BY r.fecha_entrada DESC, r.numero_entrada, p.nombre`,
      valores,
    ),
  ]);

  const proveedores = porProveedor.rows;
  const total = proveedores.reduce((s, p) => s + p.recepciones, 0);
  const sinDiferencia = proveedores.reduce((s, p) => s + p.sin_diferencia, 0);

  res.json({
    ok: true,
    resumen: {
      proveedores: proveedores.length,
      recepciones: total,
      sin_diferencia: sinDiferencia,
      porcentaje_cumplimiento: total ? Math.round((1000 * sinDiferencia) / total) / 10 : null,
    },
    por_proveedor: proveedores,
    diferencias: detalle.rows,
  });
});

module.exports = { reporteCumplimientoProveedores };
