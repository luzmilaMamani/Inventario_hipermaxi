const express = require("express");
const c = require("../controllers/programacionReporteController");

// RF70: programación del envío automático de reportes por correo.
const router = express.Router();

router.get("/tipos", c.listarTipos);
router.get("/envios", c.listarEnvios);
router.get("/", c.listarProgramaciones);
router.post("/", c.crearProgramacion);
router.put("/:id", c.actualizarProgramacion);
router.patch("/:id/estado", c.cambiarEstado);
router.post("/:id/enviar", c.enviarAhora);
router.get("/:id/envios", c.listarEnvios);

module.exports = router;
