const express = require("express");
const resources = require("../config/resources");
const { authenticate } = require("../middleware/auth");
const autorizarPorRol = require("../middleware/authorizeByRole");
const createCrudRouter = require("../utils/crudFactory");

const reportsRouter = require("./reports.routes");
const productoRouter = require("./producto.routes");
const catalogosRouter = require("./catalogos.routes");
const almacenRouter = require("./almacen.routes");
const ubicacionRouter = require("./ubicacion.routes");
const stockUbicacionRouter = require("./stockUbicacion.routes");
const clasificacionRouter = require("./clasificacion.routes");
const consultaStockRouter = require("./consultaStock.routes");
const salidaRouter = require("./salida.routes");
const ventaRouter = require("./ventas.routes");
const transferenciaRouter = require("./transferencia.routes");
const inventarioRouter = require("./inventarios.routes");
const diferenciasRouter = require("./diferencias.routes");

const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use(authenticate, autorizarPorRol);

router.use("/reportes", reportsRouter);
router.use("/productos", productoRouter);
router.use("/catalogos", catalogosRouter);
router.use("/almacenes", almacenRouter);
router.use("/ubicaciones", ubicacionRouter);
router.use("/stock-ubicaciones", stockUbicacionRouter);
router.use("/stock", consultaStockRouter);
router.use("/salidas", salidaRouter);
router.use("/ventas", ventaRouter);
router.use("/transferencias", transferenciaRouter);
router.use("/inventarios", inventarioRouter);
router.use("/diferencias", diferenciasRouter);

router.use(
  "/entradas-inventario",
  require("./entradasInventario.routes"),
);

router.use("/categorias", (req, res, next) => {
  req.url = `/categorias${req.url}`;
  clasificacionRouter(req, res, next);
});
router.use("/subcategorias", (req, res, next) => {
  req.url = `/subcategorias${req.url}`;
  clasificacionRouter(req, res, next);
});
router.use("/marcas", (req, res, next) => {
  req.url = `/marcas${req.url}`;
  clasificacionRouter(req, res, next);
});

for (const [path, resource] of Object.entries(resources)) {
  if (
    path === "productos" ||
    path === "almacenes" ||
    path === "ubicaciones" ||
    path === "stock_ubicaciones" ||
    path === "entradas_inventario" ||
    path === "categorias" ||
    path === "subcategorias" ||
    path === "marcas" ||
    path === "salidas_inventario" ||
    path === "detalle_salidas" ||
    path === "transferencias" ||
    path === "detalle_transferencias" ||
    path === "inventarios_fisicos" ||
    path === "detalle_inventario_fisico"
  ) {
    continue;
  }
  router.use(
    `/${path.replaceAll("_", "-")}`,
    createCrudRouter(resource),
  );
}

module.exports = router;
