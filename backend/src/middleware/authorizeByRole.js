const ApiError = require("../utils/apiError");

const SOLO_LECTURA = new Set(["SUPERVISOR", "GERENTE", "AUDITOR"]);
const RUTAS_CATALOGO = [
  "/productos",
  "/almacenes",
  "/ubicaciones",
  "/categorias",
  "/subcategorias",
  "/marcas",
  "/unidades-medida",
  "/roles",
  "/usuarios",
  "/integraciones",
  "/logs-integracion",
  "/referencias-externas",
  "/parametros-vencimiento",
];
const OPERACIONES_ENCARGADO = [
  { method: "POST", path: "/entradas-inventario" },
  { method: "POST", path: "/salidas" },
  { method: "POST", path: "/transferencias" },
  { method: "POST", path: "/inventarios" },
  { method: "POST", path: "/ajustes-inventario" },
  { method: "POST", path: "/diferencias" },
  { method: "POST", path: "/stock-ubicaciones" },
  { method: "POST", path: "/reportes/stock-bajo/publicar" },
  { method: "POST", path: "/alertas-vencimiento/generar" },
  { method: "PUT", path: "/alertas-vencimiento" },
  { method: "POST", path: "/etiquetas/pdf" },
  { method: "POST", path: "/devoluciones" },
  // RF56: devolución a proveedor y cierre de su reposición.
  { method: "POST", path: "/devoluciones-proveedor" },
  { method: "PUT", path: "/devoluciones-proveedor" },
  // HIP-259: despacho de materiales solicitados por Producción.
  { method: "POST", path: "/solicitudes-materiales" },
  { method: "PUT", path: "/stock-ubicaciones" },
  { method: "DELETE", path: "/stock-ubicaciones" },
];
const OPERACIONES_EMPLEADO = [
  "/entradas-inventario",
  "/salidas",
  "/transferencias",
  "/diferencias",
];

const RUTA_DECISION_AJUSTE = /^\/ajustes-inventario\/\d+\/(aprobar|rechazar)$/;
const RUTA_CUARENTENA_LOTE = /^\/lotes\/\d+\/(cuarentena|liberar)$/;
const RUTA_CANCELAR_TRANSFERENCIA = /^\/transferencias\/\d+\/cancelar$/;

function coincideRuta(path, ruta) {
  return path === ruta || path.startsWith(`${ruta}/`);
}

function autorizarPorRol(req, _res, next) {
  const { rol } = req.user;
  const metodo = req.method.toUpperCase();
  const path = req.path.replace(/\/+$/, "") || "/";

  if (rol === "ADMINISTRADOR" || ["GET", "HEAD", "OPTIONS"].includes(metodo)) {
    return next();
  }

  // RF53 y RF61: el supervisor, aunque solo consulta, decide los ajustes
  // pendientes y bloquea o libera lotes en cuarentena.
  if (
    rol === "SUPERVISOR" &&
    metodo === "POST" &&
    (RUTA_DECISION_AJUSTE.test(path) || RUTA_CUARENTENA_LOTE.test(path))
  ) {
    return next();
  }

  // RF57: el jefe de sucursal consulta, solicita y cancela transferencias.
  if (rol === "JEFE_SUCURSAL") {
    if (metodo === "POST" && (path === "/transferencias" || RUTA_CANCELAR_TRANSFERENCIA.test(path))) {
      return next();
    }
    return next(new ApiError(403, "Tu rol solo puede consultar, solicitar y cancelar transferencias"));
  }

  if (SOLO_LECTURA.has(rol)) {
    return next(
      new ApiError(403, "Tu rol solo tiene permiso para consultar información"),
    );
  }

  if (rol === "ENCARGADO_ALMACEN") {
    if (RUTA_DECISION_AJUSTE.test(path)) {
      return next(new ApiError(403, "Solo un supervisor de inventario puede aprobar o rechazar ajustes"));
    }
    const puedeOperar =
      OPERACIONES_ENCARGADO.some(
        (operacion) =>
          metodo === operacion.method && coincideRuta(path, operacion.path),
      ) ||
      (metodo === "POST" && /^\/inventarios\/\d+\/conteo$/.test(path)) ||
      (metodo === "PUT" && /^\/transferencias\/\d+\/estado$/.test(path));

    if (puedeOperar) return next();
    if (RUTAS_CATALOGO.some((ruta) => coincideRuta(path, ruta))) {
      return next(new ApiError(403, "Solo un administrador puede modificar datos maestros"));
    }
    return next(new ApiError(403, "Tu rol no puede realizar esta operación"));
  }

  if (rol === "EMPLEADO") {
    const puedeRegistrar =
      metodo === "POST" &&
      (OPERACIONES_EMPLEADO.includes(path) ||
        /^\/inventarios\/\d+\/conteo$/.test(path));
    const puedeRecibirTransferencia =
      metodo === "PUT" &&
      /^\/transferencias\/\d+\/estado$/.test(path) &&
      req.body?.estado === "RECIBIDA";

    if (puedeRegistrar || puedeRecibirTransferencia) return next();

    return next(
      new ApiError(
        403,
        "Tu rol puede consultar información y registrar operaciones de inventario autorizadas",
      ),
    );
  }

  return next(new ApiError(403, "Tu rol no tiene permisos para esta operación"));
}

module.exports = autorizarPorRol;
