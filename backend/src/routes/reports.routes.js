const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/productos-proximo-vencimiento',
  asyncHandler(async (_req, res) => {
    const result = await db.query('SELECT * FROM vw_productos_proximo_vencimiento ORDER BY proximo_vencimiento ASC');
    res.json({ ok: true, data: result.rows });
  })
);

router.get(
  '/lotes-proximos-vencer',
  asyncHandler(async (_req, res) => {
    const result = await db.query('SELECT * FROM vw_lotes_proximos_vencer');
    res.json({ ok: true, data: result.rows });
  })
);

router.get(
  '/stock-bajo',
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      `SELECT
        p.id_producto,
        p.codigo,
        p.nombre,
        a.id_almacen,
        a.nombre AS almacen,
        s.cantidad,
        p.stock_minimo,
        p.punto_reposicion
      FROM stock s
      INNER JOIN productos p ON p.id_producto = s.id_producto
      INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
      WHERE s.cantidad <= NULLIF(p.punto_reposicion, 0)
        OR s.cantidad <= p.stock_minimo
      ORDER BY s.cantidad ASC`
    );

    res.json({ ok: true, data: result.rows });
  })
);

module.exports = router;
