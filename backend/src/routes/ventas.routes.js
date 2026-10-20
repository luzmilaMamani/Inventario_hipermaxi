const express = require("express");
const ventaController = require("../controllers/ventaController");

const router = express.Router();

router.post("/descontar", ventaController.registrarVenta);

module.exports = router;