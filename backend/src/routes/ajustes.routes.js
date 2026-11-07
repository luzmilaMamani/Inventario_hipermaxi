const express = require("express");
const ajusteController = require("../controllers/ajusteController");

const router = express.Router();

router.get("/", ajusteController.listarAjustes);
router.post("/", ajusteController.crearAjuste);
router.get("/:id", ajusteController.obtenerAjuste);
router.put("/:id", ajusteController.rechazarCambio);
router.patch("/:id", ajusteController.rechazarCambio);
router.delete("/:id", ajusteController.rechazarCambio);

module.exports = router;
