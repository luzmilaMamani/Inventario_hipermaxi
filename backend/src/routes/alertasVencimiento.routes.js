const express = require("express");
const {
  listarAlertas,
  resumenAlertas,
  marcarLeida,
  marcarVariasLeidas,
  generarAhora,
} = require("../controllers/alertaVencimientoController");

const router = express.Router();

router.get("/", listarAlertas);
router.get("/resumen", resumenAlertas);
router.post("/generar", generarAhora);
router.put("/leidas", marcarVariasLeidas);
router.put("/:id/leida", marcarLeida);

module.exports = router;
