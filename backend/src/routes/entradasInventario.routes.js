const express = require("express");
const { registrarRecepcion } = require("../controllers/entradaInventarioController");
const {
  obtenerRecepcion,
  listarDiferencias,
  registrarDiferencia,
} = require("../controllers/diferenciaRecepcionController");

const router = express.Router();

router.get("/:id/diferencias", listarDiferencias);
router.post("/:id/diferencias", registrarDiferencia);
router.get("/:id", obtenerRecepcion);
router.post("/", registrarRecepcion);

module.exports = router;
