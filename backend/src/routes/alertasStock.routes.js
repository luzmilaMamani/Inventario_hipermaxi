const express = require("express");
const { listarAlertas } = require("../controllers/alertaStockController");

const router = express.Router();

router.get("/", listarAlertas);

module.exports = router;
