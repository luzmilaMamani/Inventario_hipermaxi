const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { esFechaValida } = require("../utils/filtrosReporte");
const { analizarRotacion } = require("../services/rotacion");

const CLASES = ["ALTA", "MEDIA", "BAJA", "SIN_MOVIMIENTO", "SIN_STOCK"];

const idOpcional = (valor, mensaje) => {
  if (valor === undefined || valor === "") return null;
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, mensaje);
  return id;
};

// RF65: GET /api/reportes/rotacion?fecha_desde&fecha_hasta&id_almacen&id_categoria&clasificacion
// Por defecto, los últimos 90 días.
const reporteRotacion = asyncHandler(async (req, res) => {
  const hasta = req.query.fecha_hasta || new Date().toISOString().slice(0, 10);
  const desde = req.query.fecha_desde || new Date(Date.parse(hasta) - 89 * 86400000).toISOString().slice(0, 10);
  if (!esFechaValida(desde) || !esFechaValida(hasta)) throw new ApiError(400, "Las fechas no son válidas");
  if (desde > hasta) throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  const idAlmacen = idOpcional(req.query.id_almacen, "El almacén no es válido");
  const idCategoria = idOpcional(req.query.id_categoria, "La categoría no es válida");
  if (req.query.clasificacion && !CLASES.includes(req.query.clasificacion)) {
    throw new ApiError(400, "La clasificación no es válida");
  }

  const { rows } = await db.query("SELECT * FROM fn_rotacion_productos($1, $2, $3, $4)", [
    desde,
    hasta,
    idAlmacen,
    idCategoria,
  ]);
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
  const analisis = analizarRotacion(rows, dias);
  const data = req.query.clasificacion
    ? analisis.data.filter((f) => f.clasificacion === req.query.clasificacion)
    : analisis.data;

  res.json({ ok: true, periodo: { desde, hasta, dias }, resumen: analisis.resumen, data });
});

module.exports = { reporteRotacion };
