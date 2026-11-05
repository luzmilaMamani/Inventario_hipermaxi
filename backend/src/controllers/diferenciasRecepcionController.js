const { readFileSync } = require("node:fs");
const path = require("node:path");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const TIPOS_VALIDOS = ["FALTANTE", "SOBRANTE", "DANADO"];
let tablaLista = false;

async function asegurarTablaDiferencias() {
  if (tablaLista) return;
  const diferencias = readFileSync(
    path.join(__dirname, "../../sql/rf21_diferencias_recepcion.sql"),
    "utf8",
  );
  await db.query(diferencias);
  tablaLista = true;
}

const registrarDiferencia = asyncHandler(async (req, res) => {
  const { id_entrada, id_producto, tipo, cantidad, observaciones } = req.body;
  const observacion =
    String(observaciones ?? req.body.observacion ?? "").trim() || null;

  if (!id_entrada || !id_producto || !tipo || !cantidad) {
    throw new ApiError(400, "Entrada, producto, tipo y cantidad son obligatorios");
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new ApiError(400, `Tipo inválido. Permitidos: ${TIPOS_VALIDOS.join(", ")}`);
  }
  if (!Number.isSafeInteger(Number(cantidad)) || Number(cantidad) <= 0) {
    throw new ApiError(400, "La cantidad debe ser un número entero mayor a 0");
  }

  await asegurarTablaDiferencias();
  const result = await db.query(
    `INSERT INTO diferencias_recepcion
      (id_entrada, id_producto, tipo, cantidad, observacion, id_usuario)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id_entrada, id_producto, tipo, cantidad, observacion, req.user.id_usuario]
  );

  res.status(201).json({ ok: true, message: "Diferencia registrada", data: result.rows[0] });
});

const listarDiferenciasPorEntrada = asyncHandler(async (req, res) => {
  const { id_entrada } = req.params;
  await asegurarTablaDiferencias();
  const result = await db.query(
    `SELECT d.*, p.nombre AS producto, p.codigo
     FROM diferencias_recepcion d
     INNER JOIN productos p ON p.id_producto = d.id_producto
     WHERE d.id_entrada = $1`,
    [id_entrada]
  );
  res.json({ ok: true, data: result.rows });
});

module.exports = { registrarDiferencia, listarDiferenciasPorEntrada };