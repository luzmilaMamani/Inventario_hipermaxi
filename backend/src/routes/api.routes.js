const express = require("express");
const resources = require("../config/resources");
const { authenticate } = require("../middleware/auth");
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
const ventaRouter = require("./ventas.routes"); // <-- NUEVO

const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use("/reportes", authenticate, reportsRouter);
router.use("/productos", authenticate, productoRouter);
router.use("/catalogos", authenticate, catalogosRouter);
router.use("/almacenes", authenticate, almacenRouter);
router.use("/ubicaciones", authenticate, ubicacionRouter);
router.use("/stock-ubicaciones", authenticate, stockUbicacionRouter);
router.use("/stock", authenticate, consultaStockRouter);
router.use("/salidas", authenticate, salidaRouter);
router.use("/ventas", authenticate, ventaRouter); // <-- NUEVO

router.use("/entradas-inventario", authenticate, require("./entradasInventario.routes"));
router.use("/categorias", authenticate, (req, res, next) => {
  req.url = `/categorias${req.url}`;
  clasificacionRouter(req, res, next);
});
router.use("/subcategorias", authenticate, (req, res, next) => {
  req.url = `/subcategorias${req.url}`;
  clasificacionRouter(req, res, next);
});
router.use("/marcas", authenticate, (req, res, next) => {
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
    path === "detalle_salidas"
  ) {
    continue;
  }
  router.use(
    `/${path.replaceAll("_", "-")}`,
    authenticate,
    createCrudRouter(resource),
  );
}

module.exports = router;