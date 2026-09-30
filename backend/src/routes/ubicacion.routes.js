const express = require("express");
const ubicacionController = require("../controllers/ubicacionController");
const {
  validarCrearUbicacion,
} = require("../middleware/validateUbicacion");

const router = express.Router();

router.get("/", ubicacionController.listarUbicaciones);
router.get("/:id", ubicacionController.obtenerUbicacion);
router.get("/:id/stock", ubicacionController.obtenerStockUbicacion);

router.post("/", validarCrearUbicacion, ubicacionController.crearUbicacion);
router.put("/:id", ubicacionController.actualizarUbicacion);
router.delete("/:id", ubicacionController.eliminarUbicacion);

module.exports = router;