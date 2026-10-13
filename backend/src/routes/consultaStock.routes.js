const express = require("express");
const {
  consultarStock,
  consultarHistorialProducto,
} = require("../controllers/consultaStockController");

const router = express.Router();

router.get("/consulta", consultarStock);
router.get("/historial/:id_producto", consultarHistorialProducto);

module.exports = router;