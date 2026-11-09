const express = require("express");
const solicitudMaterialController = require("../controllers/solicitudMaterialController");

const router = express.Router();

router.get("/", solicitudMaterialController.listarSolicitudes);
router.get("/eventos", solicitudMaterialController.listarEventos);
router.post("/simular/solicitud", solicitudMaterialController.simularSolicitud);
router.post("/simular/terminados", solicitudMaterialController.simularTerminados);
router.get("/:id", solicitudMaterialController.obtenerSolicitud);
router.post("/:id/despachar", solicitudMaterialController.despachar);

module.exports = router;
