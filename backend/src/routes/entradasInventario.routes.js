const express = require("express");
const { registrarRecepcion } = require("../controllers/entradaInventarioController");

const router = express.Router();

router.post("/", registrarRecepcion);

module.exports = router;
