const express = require("express");
const { consultarMetricas, reprocesarMensaje } = require("../controllers/integracionesController");

// RF75: monitoreo de las integraciones asíncronas. El resto de /integraciones
// sigue siendo el catálogo de sistemas (CRUD genérico).
const router = express.Router();

router.get("/metricas", consultarMetricas);
router.post("/mensajes/:tipo/:id/reprocesar", reprocesarMensaje);

module.exports = router;
