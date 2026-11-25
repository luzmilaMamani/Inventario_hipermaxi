const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { esFechaValida } = require("../utils/filtrosReporte");
const { obtenerIndicadores, aplicarMetasYTendencia, guardarMetaKpi, DEFINICIONES_KPI } = require("../services/indicadores");

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
  data.kpis = await aplicarMetasYTendencia(data.kpis, { idAlmacen, hasta });
  res.json({ ok: true, data });
});

const leerAlmacen = (valor) => {
  if (valor === undefined || valor === null || valor === "") return null;
  const idAlmacen = Number(valor);
  if (!Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
    throw new ApiError(400, "El almacén no es válido");
  }
  return idAlmacen;
};

// El gerente cambia la meta global o la de la sucursal que está mirando.
const guardarMetaIndicador = asyncHandler(async (req, res) => {
  const codigo = String(req.body?.codigo || "");
  if (!DEFINICIONES_KPI[codigo]) throw new ApiError(400, "El indicador no existe");
  const idAlmacen = leerAlmacen(req.body?.id_almacen);
  const data = await guardarMetaKpi({
    codigo,
    idAlmacen,
    meta: req.body?.meta,
    idUsuario: req.user?.id_usuario || null,
  });
  res.json({ ok: true, message: "Meta actualizada", data });
});

module.exports = { consultarIndicadores, guardarMetaIndicador };
