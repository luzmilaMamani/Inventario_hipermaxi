const express = require("express");
const stockUbicacionController = require("../controllers/stockUbicacionController");
const {
  validarAsignarProducto,
} = require("../middleware/validateUbicacion");

const router = express.Router();

router.post(
  "/",
  validarAsignarProducto,
  stockUbicacionController.asignarProducto,
);
router.put("/:id", stockUbicacionController.actualizarCantidad);
router.delete("/:id", stockUbicacionController.quitarProducto);

module.exports = router;