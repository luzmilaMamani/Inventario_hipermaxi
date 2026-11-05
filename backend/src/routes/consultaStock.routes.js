const express = require("express");
const {
  consultarStock,
  consultarHistorialProducto,
  consultarProximosVencer,
} = require("../controllers/consultaStockController");

const router = express.Router();

router.get("/consulta", consultarStock);
router.get("/proximos-vencer", consultarProximosVencer);
router.get("/historial/:id_producto", consultarHistorialProducto);

module.exports = router;