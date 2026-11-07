const express = require("express");
const {
  listarRecepciones,
  obtenerRecepcion,
  registrarRecepcion,
} = require("../controllers/entradaInventarioController");

const router = express.Router();

router.get("/", listarRecepciones);
router.get("/:id", obtenerRecepcion);
router.post("/", registrarRecepcion);

module.exports = router;
