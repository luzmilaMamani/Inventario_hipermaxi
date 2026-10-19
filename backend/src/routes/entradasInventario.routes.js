const express = require("express");
const {
  registrarRecepcion,
  confirmarRecepcion,
} = require("../controllers/entradaInventarioController");
const {
  obtenerRecepcion,
  listarDiferencias,
  registrarDiferencia,
} = require("../controllers/diferenciaRecepcionController");

const router = express.Router();

router.post("/:id/confirmar", confirmarRecepcion);
router.get("/:id/diferencias", listarDiferencias);
router.post("/:id/diferencias", registrarDiferencia);
router.get("/:id", obtenerRecepcion);
router.post("/", registrarRecepcion);

module.exports = router;
