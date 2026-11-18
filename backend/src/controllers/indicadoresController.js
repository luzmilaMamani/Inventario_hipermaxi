const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { esFechaValida } = require("../utils/filtrosReporte");
const { obtenerIndicadores } = require("../services/indicadores");

const hoy = () => new Date().toISOString().slice(0, 10);
const inicioDeMes = () => `${hoy().slice(0, 8)}01`;

// RF62: GET /api/reportes/indicadores?id_almacen=&fecha_desde=&fecha_hasta=
// Sin fechas toma el mes en curso.
const consultarIndicadores = asyncHandler(async (req, res) => {
  const desde = req.query.fecha_desde || inicioDeMes();
  const hasta = req.query.fecha_hasta || hoy();
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new ApiError(400, "Las fechas del período no son válidas");
  }
  if (desde > hasta) {
    throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  }

  let idAlmacen = null;
  if (req.query.id_almacen !== undefined && req.query.id_almacen !== "") {
    idAlmacen = Number(req.query.id_almacen);
    if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
      throw new ApiError(400, "El almacén no es válido");
    }
  }

  const data = await obtenerIndicadores({ idAlmacen, desde, hasta });
  res.json({ ok: true, data });
});

module.exports = { consultarIndicadores };
