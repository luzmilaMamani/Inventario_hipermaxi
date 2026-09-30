const express = require("express");
const almacenController = require("../controllers/almacenController");
const {
  validarCrearAlmacen,
  validarActualizarAlmacen,
} = require("../middleware/validateAlmacen");

const router = express.Router();

router.get("/", almacenController.listarAlmacenes);
router.get("/:id", almacenController.obtenerAlmacen);
router.get("/:id/stock", almacenController.obtenerStockAlmacen);

router.post("/", validarCrearAlmacen, almacenController.crearAlmacen);
router.put("/:id", validarActualizarAlmacen, almacenController.actualizarAlmacen);
router.delete("/:id", almacenController.eliminarAlmacen);

module.exports = router;