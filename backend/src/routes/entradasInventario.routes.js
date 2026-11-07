const express = require("express");
const {
  listarRecepciones,
  registrarRecepcion,
  confirmarRecepcion,
} = require("../controllers/entradaInventarioController");
const {
  obtenerRecepcion,
  listarDiferencias,
  registrarDiferencia,
} = require("../controllers/diferenciaRecepcionController");

const router = express.Router();

router.get("/", listarRecepciones);
router.post("/", registrarRecepcion);
router.get("/:id/diferencias", listarDiferencias);
router.post("/:id/diferencias", registrarDiferencia);
router.post("/:id/confirmar", confirmarRecepcion);
router.get("/:id", obtenerRecepcion);

module.exports = router;
