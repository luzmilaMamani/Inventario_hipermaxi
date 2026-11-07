const express = require("express");
const devolucionController = require("../controllers/devolucionController");

const router = express.Router();

router.get("/", devolucionController.listarDevoluciones);
router.get("/ventas", devolucionController.buscarVentas);
router.get("/ventas/:id", devolucionController.obtenerVentaDevolvible);
router.get("/:id", devolucionController.obtenerDevolucion);
router.post("/", devolucionController.crearDevolucion);

module.exports = router;
