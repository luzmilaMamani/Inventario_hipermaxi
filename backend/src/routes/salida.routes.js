const express = require("express");
const salidaController = require("../controllers/salidaController");
const { validarCrearSalida } = require("../middleware/validateSalida");

const router = express.Router();

router.get("/", salidaController.listarSalidas);
router.get("/:id", salidaController.obtenerSalida);
router.post("/", validarCrearSalida, salidaController.crearSalida);

module.exports = router;
