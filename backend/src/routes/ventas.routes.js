const express = require("express");
const ventaController = require("../controllers/ventaController");
const { simularVenta } = require("../controllers/ventaSimuladaController");

const router = express.Router();

router.post("/descontar", ventaController.registrarVenta);
// RF72: entrada del JSON de Ventas sin Pub/Sub (solo fuera de producción).
router.post("/simular", simularVenta);

module.exports = router;