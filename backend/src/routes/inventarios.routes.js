const express = require("express");
const invController = require("../controllers/inventarioFisicoController");

const router = express.Router();

router.get("/", invController.listarInventarios);
router.post("/", invController.crearInventario);
router.post("/:id_inventario/conteo", invController.registrarConteo);
router.get("/:id_inventario/comparativa", invController.obtenerComparativa);
router.get("/:id_inventario/diferencias", invController.obtenerDiferencias); // <-- NUEVA

module.exports = router;