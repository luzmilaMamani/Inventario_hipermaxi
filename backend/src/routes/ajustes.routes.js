const express = require("express");
const ajusteController = require("../controllers/ajusteController");

const router = express.Router();

router.get("/", ajusteController.listarAjustes);
router.post("/", ajusteController.crearAjuste);

// RF53: límite configurable y bandeja de aprobación.
router.get("/limites", ajusteController.obtenerLimites);
router.put("/limites", ajusteController.actualizarLimites);
router.get("/pendientes/resumen", ajusteController.resumenPendientes);
router.post("/:id/aprobar", ajusteController.aprobarAjuste);
router.post("/:id/rechazar", ajusteController.rechazarAjuste);

router.get("/:id", ajusteController.obtenerAjuste);
router.put("/:id", ajusteController.rechazarCambio);
router.patch("/:id", ajusteController.rechazarCambio);
router.delete("/:id", ajusteController.rechazarCambio);

module.exports = router;
