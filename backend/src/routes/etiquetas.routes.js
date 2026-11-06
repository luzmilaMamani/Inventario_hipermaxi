const express = require("express");
const {
  listarProductosEtiquetables,
  generarEtiquetas,
} = require("../controllers/etiquetaController");

const router = express.Router();

router.get("/productos", listarProductosEtiquetables);
router.post("/pdf", generarEtiquetas);

module.exports = router;
