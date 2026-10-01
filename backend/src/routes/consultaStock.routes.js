const express = require("express");
const { consultarStock } = require("../controllers/consultaStockController");

const router = express.Router();

router.get("/consulta", consultarStock);

module.exports = router;