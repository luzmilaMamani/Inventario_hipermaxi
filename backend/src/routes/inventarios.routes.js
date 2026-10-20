const express = require("express");
const invController = require("../controllers/inventarioFisicoController");

const router = express.Router();

router.get("/", invController.listarInventarios);
router.post("/", invController.crearInventario);

module.exports = router;