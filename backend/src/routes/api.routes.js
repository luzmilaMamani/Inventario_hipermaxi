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

const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use("/reportes", authenticate, reportsRouter);
router.use("/productos", authenticate, productoRouter);
router.use("/catalogos", authenticate, catalogosRouter);
router.use("/almacenes", authenticate, almacenRouter);
router.use("/ubicaciones", authenticate, ubicacionRouter);
router.use("/stock-ubicaciones", authenticate, stockUbicacionRouter);

for (const [path, resource] of Object.entries(resources)) {
  if (
    path === "productos" ||
    path === "almacenes" ||
    path === "ubicaciones" ||
    path === "stock_ubicaciones"
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