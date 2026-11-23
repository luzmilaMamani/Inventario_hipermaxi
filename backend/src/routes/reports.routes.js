const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const { reporteDanos, reporteVencimientos } = require("../controllers/salidaController");
const { reportePerdidas } = require("../controllers/reportePerdidasController");
const { reporteVencimientosLotes } = require("../controllers/reporteVencimientosLotesController");
const { reporteTransferencias } = require("../controllers/reporteTransferenciasController");
const { reporteValorizacion } = require("../controllers/reporteValorizacionController");
const { reporteMovimientos } = require("../controllers/reporteMovimientosController");
const { reporteRotacion } = require("../controllers/reporteRotacionController");
const { reporteCumplimientoProveedores } = require("../controllers/reporteCumplimientoController");
const { publicarStockBajo } = require("../controllers/stockBajoPubSubController");
const { reporteExistencias } = require("../controllers/reporteExistenciasController");
const { reporteStockBajo } = require("../controllers/reporteStockBajoController");
const { reporteAjustes } = require("../controllers/reporteAjustesController");
const { reporteKardex } = require("../controllers/reporteKardexController");
const { reporteComparativoSucursales } = require("../controllers/reporteComparativoController");
const { consultarIndicadores, guardarMetaIndicador } = require("../controllers/indicadoresController");
const { authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/productos-proximo-vencimiento",
  asyncHandler(async (_req, res) => {
    const result = await db.query(
      "SELECT * FROM vw_productos_proximo_vencimiento ORDER BY proximo_vencimiento ASC",
    );
    res.json({ ok: true, data: result.rows });
  }),
);

router.get(
  "/lotes-proximos-vencer",
  asyncHandler(async (_req, res) => {
    const result = await db.query("SELECT * FROM vw_lotes_proximos_vencer");
    res.json({ ok: true, data: result.rows });
  }),
);

router.get("/stock-bajo", reporteStockBajo);
router.get("/ajustes", reporteAjustes);
router.get("/kardex", reporteKardex);

router.post("/stock-bajo/publicar", publicarStockBajo);

router.get("/perdidas", reportePerdidas);
router.get("/danos", reporteDanos);
router.get("/vencimientos", reporteVencimientos);
router.get("/vencimientos-lotes", reporteVencimientosLotes);
router.get("/transferencias", reporteTransferencias);
router.get("/valorizacion", reporteValorizacion);
router.get("/movimientos", reporteMovimientos);
router.get("/rotacion", reporteRotacion);
router.get("/cumplimiento-proveedores", reporteCumplimientoProveedores);
router.get("/existencias", reporteExistencias);
router.get("/comparativo-sucursales", reporteComparativoSucursales);
router.get("/indicadores", consultarIndicadores);
router.put("/indicadores/metas", authorizeRoles("GERENTE", "ADMINISTRADOR"), guardarMetaIndicador);

module.exports = router;
