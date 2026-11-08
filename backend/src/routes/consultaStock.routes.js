const express = require("express");
const {
  consultarStock,
  consultarHistorialProducto,
  consultarProximosVencer,
  consultarLotesVencidos,
} = require("../controllers/consultaStockController");

const router = express.Router();

router.get("/consulta", consultarStock);
router.get("/proximos-vencer", consultarProximosVencer);
router.get("/vencidos", consultarLotesVencidos);
router.get("/historial/:id_producto", consultarHistorialProducto);

module.exports = router;
