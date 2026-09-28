const express = require("express");
const productoController = require("../controllers/productoController");
const estadoProductoController = require("../controllers/estadoProductoController");
const {
  validarCrearProducto,
  validarActualizarProducto,
  validarCambioEstado,
} = require("../middleware/validateProducto");

const router = express.Router();

// Búsqueda por código de barras
router.get("/barcode/:codigo", productoController.buscarPorCodigoBarras);

// Consultas
router.get("/", productoController.listarProductos);
router.get("/:id", productoController.obtenerProducto);

// Estado del producto (HIP-15 / RF06)
router.get("/:id/estado", estadoProductoController.obtenerEstadoProducto);
router.put(
  "/:id/estado",
  validarCambioEstado,
  estadoProductoController.cambiarEstadoProducto
);

// Registro
router.post("/", validarCrearProducto, productoController.crearProducto);

// Modificación
router.put(
  "/:id",
  validarActualizarProducto,
  productoController.actualizarProducto
);

// Borrado lógico
router.delete("/:id", productoController.eliminarProducto);

module.exports = router;