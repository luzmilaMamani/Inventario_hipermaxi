const express = require("express");
const transferenciaController = require("../controllers/transferenciaController");

const router = express.Router();

router.get("/", transferenciaController.listarTransferencias);
router.get("/:id", transferenciaController.obtenerTransferencia);
router.post("/", transferenciaController.crearTransferencia);
router.put("/:id/estado", transferenciaController.cambiarEstado);
router.post("/:id/cancelar", transferenciaController.cancelarTransferencia);

module.exports = router;
