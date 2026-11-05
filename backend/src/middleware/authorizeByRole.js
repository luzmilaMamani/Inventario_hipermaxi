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
];
const OPERACIONES_ENCARGADO = [
  { method: "POST", path: "/entradas-inventario" },
  { method: "POST", path: "/salidas" },
  { method: "POST", path: "/transferencias" },
  { method: "POST", path: "/inventarios" },
  { method: "POST", path: "/diferencias" },
  { method: "POST", path: "/stock-ubicaciones" },
  { method: "POST", path: "/reportes/stock-bajo/publicar" },
  { method: "PUT", path: "/stock-ubicaciones" },
  { method: "DELETE", path: "/stock-ubicaciones" },
];
const OPERACIONES_EMPLEADO = [
  "/entradas-inventario",
  "/salidas",
  "/transferencias",
  "/diferencias",
];

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

  if (SOLO_LECTURA.has(rol)) {
    return next(
      new ApiError(403, "Tu rol solo tiene permiso para consultar información"),
    );
  }

  if (rol === "ENCARGADO_ALMACEN") {
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
