const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

/**
 * GET /api/catalogos/categorias
 * Devuelve categorías activas ordenadas alfabéticamente.
 */
router.get(
  "/categorias",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT id_categoria, nombre, descripcion
       FROM categorias
       WHERE activo = TRUE
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  })
);

/**
 * GET /api/catalogos/subcategorias
 * Query: ?id_categoria=1 (opcional)
 */
router.get(
  "/subcategorias",
  asyncHandler(async (req, res) => {
    const { id_categoria } = req.query;
    const params = [];
    let where = "WHERE activo = TRUE";

    if (id_categoria) {
      params.push(id_categoria);
      where += ` AND id_categoria = $${params.length}`;
    }

    const result = await db.query(
      `SELECT id_subcategoria, id_categoria, nombre, descripcion
       FROM subcategorias
       ${where}
       ORDER BY nombre ASC`,
      params
    );
    res.json({ ok: true, data: result.rows });
  })
);

/**
 * GET /api/catalogos/marcas
 */
router.get(
  "/marcas",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT id_marca, nombre, descripcion
       FROM marcas
       WHERE activo = TRUE
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  })
);

/**
 * GET /api/catalogos/unidades-medida
 */
router.get(
  "/unidades-medida",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT id_unidad, nombre, abreviatura
       FROM unidades_medida
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  })
);

/**
 * GET /api/catalogos/almacenes
 */
router.get(
  "/almacenes",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT id_almacen, codigo, nombre, tipo, ciudad
       FROM almacenes
       WHERE activo = TRUE
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  })
);

module.exports = router;