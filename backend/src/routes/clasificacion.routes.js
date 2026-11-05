const express = require("express");
const categoriaController = require("../controllers/categoriaController");
const subcategoriaController = require("../controllers/subcategoriaController");
const marcaController = require("../controllers/marcaController");

const router = express.Router();

// Categorías
router.get("/categorias", categoriaController.listarCategorias);
router.get("/categorias/:id", categoriaController.obtenerCategoria);
router.post("/categorias", categoriaController.crearCategoria);
router.put("/categorias/:id", categoriaController.actualizarCategoria);
router.delete("/categorias/:id", categoriaController.eliminarCategoria);

// Subcategorías
router.get("/subcategorias", subcategoriaController.listarSubcategorias);
router.get("/subcategorias/:id", subcategoriaController.obtenerSubcategoria);
router.post("/subcategorias", subcategoriaController.crearSubcategoria);
router.put("/subcategorias/:id", subcategoriaController.actualizarSubcategoria);
router.delete("/subcategorias/:id", subcategoriaController.eliminarSubcategoria);

// Marcas
router.get("/marcas", marcaController.listarMarcas);
router.get("/marcas/:id", marcaController.obtenerMarca);
router.post("/marcas", marcaController.crearMarca);
router.put("/marcas/:id", marcaController.actualizarMarca);
router.delete("/marcas/:id", marcaController.eliminarMarca);

module.exports = router;