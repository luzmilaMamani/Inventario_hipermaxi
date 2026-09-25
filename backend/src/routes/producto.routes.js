const express = require("express");
const productoController = require("../controllers/productoController");
const {
  validarCrearProducto,
  validarActualizarProducto,
} = require("../middleware/validateProducto");

const router = express.Router();

//- Búsqueda por código de barras
router.get("/barcode/:codigo", productoController.buscarPorCodigoBarras);

//  Consultas
router.get("/", productoController.listarProductos);
router.get("/:id", productoController.obtenerProducto);

//  Registro
router.post("/", validarCrearProducto, productoController.crearProducto);

//  Modificación
router.put(
  "/:id",
  validarActualizarProducto,
  productoController.actualizarProducto,
);

// Borrado lógico
router.delete("/:id", productoController.eliminarProducto);

module.exports = router;
