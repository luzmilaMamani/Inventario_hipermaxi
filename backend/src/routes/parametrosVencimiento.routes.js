const express = require("express");
const {
  listarParametros,
  actualizarGeneral,
  guardarCategoria,
  eliminarCategoria,
} = require("../controllers/parametroVencimientoController");

const router = express.Router();

router.get("/", listarParametros);
router.put("/general", actualizarGeneral);
router.put("/categorias/:id_categoria", guardarCategoria);
router.delete("/categorias/:id_categoria", eliminarCategoria);

module.exports = router;
