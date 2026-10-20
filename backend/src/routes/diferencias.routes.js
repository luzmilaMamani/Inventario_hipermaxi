const express = require("express");
const difController = require("../controllers/diferenciasRecepcionController");

const router = express.Router();

router.post("/", difController.registrarDiferencia);
router.get("/entrada/:id_entrada", difController.listarDiferenciasPorEntrada);

module.exports = router;