const express = require("express");
const devolucionProveedorController = require("../controllers/devolucionProveedorController");

const router = express.Router();

router.get("/", devolucionProveedorController.listarDevolucionesProveedor);
router.get("/recepciones", devolucionProveedorController.buscarRecepciones);
router.get("/recepciones/:id", devolucionProveedorController.obtenerRecepcionDevolvible);
router.get("/:id", devolucionProveedorController.obtenerDevolucionProveedor);
router.post("/", devolucionProveedorController.crearDevolucionProveedor);
router.put("/:id/reposicion", devolucionProveedorController.registrarReposicion);

module.exports = router;
