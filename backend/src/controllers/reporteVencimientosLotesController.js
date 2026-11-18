const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { crearFiltros } = require("../utils/filtrosReporte");
const { CONDICION_LOTE_VENCIDO } = require("../services/lotesVencidos");

// Lote vigente que vence dentro de los próximos `dias` días (lo que vence hoy
// ya cuenta como vencido, RF43; la cuarentena no se vende, RF61).
const CONDICION_POR_VENCER = `
  lp.cantidad_actual > 0
  AND lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
  AND lp.fecha_vencimiento > CURRENT_DATE
  AND lp.fecha_vencimiento <= CURRENT_DATE + ?::int`;

const COLUMNAS = `
  lp.id_lote,
  lp.numero_lote,
  TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
  (lp.fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
  lp.cantidad_actual AS cantidad,
  COALESCE(p.precio, 0) AS precio_unitario,
  (lp.cantidad_actual * COALESCE(p.precio, 0))::numeric(14, 2) AS valor,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  um.abreviatura AS unidad,
  c.id_categoria,
  c.nombre AS categoria,
  a.id_almacen,
  a.codigo AS almacen_codigo,
  a.nombre AS almacen`;

const FROM = `
  FROM lotes_productos lp
  INNER JOIN productos p ON p.id_producto = lp.id_producto
  INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
  INNER JOIN categorias c ON c.id_categoria = p.id_categoria
  INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad`;

// RF63: lotes vencidos y próximos a vencer, por separado y valorizados.
// Filtros: dias (1-365, por defecto 30), id_almacen, id_categoria.
const reporteVencimientosLotes = asyncHandler(async (req, res) => {
  const dias = req.query.dias === undefined || req.query.dias === "" ? 30 : Number(req.query.dias);
  if (!Number.isSafeInteger(dias) || dias < 1 || dias > 365) {
    throw new ApiError(400, "El rango de días debe ser un entero entre 1 y 365");
  }

  // Los dos grupos comparten filtros; el de próximos suma el parámetro de días.
  const armarFiltros = () => {
    const f = crearFiltros();
    f.id(req.query.id_almacen, "lp.id_almacen", "El almacén no es válido");
    f.id(req.query.id_categoria, "p.id_categoria", "La categoría no es válida");
    return f;
  };
  const base = armarFiltros();
  const porVencer = armarFiltros();
  porVencer.agregar(CONDICION_POR_VENCER, dias);

  const resumenDe = (filas) => ({
    lotes: filas.length,
    unidades: filas.reduce((s, f) => s + Number(f.cantidad), 0),
    valor: Math.round(filas.reduce((s, f) => s + Number(f.valor), 0) * 100) / 100,
  });

  const [vencidos, proximos] = await Promise.all([
    db.query(
      `SELECT ${COLUMNAS} ${FROM} ${base.where([CONDICION_LOTE_VENCIDO])}
       ORDER BY lp.fecha_vencimiento ASC, p.nombre ASC`,
      base.valores,
    ),
    db.query(
      `SELECT ${COLUMNAS} ${FROM} ${porVencer.where()}
       ORDER BY lp.fecha_vencimiento ASC, p.nombre ASC`,
      porVencer.valores,
    ),
  ]);

  res.json({
    ok: true,
    filtros: { dias },
    vencidos: vencidos.rows,
    proximos: proximos.rows,
    resumen: {
      vencidos: resumenDe(vencidos.rows),
      proximos: resumenDe(proximos.rows),
    },
  });
});

module.exports = { reporteVencimientosLotes };
