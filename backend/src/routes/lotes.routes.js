const express = require("express");
const loteController = require("../controllers/loteController");

const router = express.Router();

router.get("/", loteController.listarLotes);
router.get("/:id/cuarentena", loteController.historialCuarentena);
router.post("/:id/cuarentena", loteController.ponerEnCuarentena);
router.post("/:id/liberar", loteController.liberarCuarentena);

module.exports = router;
