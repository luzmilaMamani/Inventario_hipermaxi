const express = require("express");
const resources = require("../config/resources");
const { authenticate } = require("../middleware/auth");
const createCrudRouter = require("../utils/crudFactory");
const reportsRouter = require("./reports.routes");
const productoRouter = require("./producto.routes");

const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use("/reportes", authenticate, reportsRouter);
router.use("/productos", authenticate, productoRouter);

for (const [path, resource] of Object.entries(resources)) {
  if (path === "productos") continue;
  router.use(
    `/${path.replaceAll("_", "-")}`,
    authenticate,
    createCrudRouter(resource),
  );
}

module.exports = router;
