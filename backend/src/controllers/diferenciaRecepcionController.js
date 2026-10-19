const { readFileSync } = require("node:fs");
const path = require("node:path");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { normalizarDiferencia } = require("../utils/diferenciaRecepcion");

let tablaLista = false;

async function asegurarTablaDiferencias() {
  if (tablaLista) return;

  const verificacion = readFileSync(
    path.join(__dirname, "../../sql/rf20_verificacion_recepcion.sql"),
    "utf8",
  );
  const diferencias = readFileSync(
    path.join(__dirname, "../../sql/rf21_diferencias_recepcion.sql"),
    "utf8",
  );
  const confirmacion = readFileSync(
    path.join(__dirname, "../../sql/rf22_confirmar_recepcion.sql"),
    "utf8",
  );
  await db.query(verificacion);
  await db.query(diferencias);
  await db.query(confirmacion);
  tablaLista = true;
}

function leerIdEntrada(valor) {
  const idEntrada = Number(valor);
  if (!Number.isSafeInteger(idEntrada) || idEntrada <= 0) {
    throw new ApiError(400, "La recepción no es válida");
  }
  return idEntrada;
}

const CONSULTA_DIFERENCIAS = `
  SELECT
    d.id_diferencia,
    d.id_entrada,
    d.id_producto,
    d.tipo,
    d.cantidad,
    d.observacion,
    d.fecha_registro,
    d.id_usuario,
    p.codigo AS producto_codigo,
    p.nombre AS producto,
    u.nombre_completo AS usuario
  FROM diferencias_recepcion d
  JOIN productos p ON p.id_producto = d.id_producto
  LEFT JOIN usuarios u ON u.id_usuario = d.id_usuario
  WHERE d.id_entrada = $1
  ORDER BY d.fecha_registro DESC, d.id_diferencia DESC
`;

async function buscarDiferencias(idEntrada) {
  const resultado = await db.query(CONSULTA_DIFERENCIAS, [idEntrada]);
  return resultado.rows;
}

const obtenerRecepcion = asyncHandler(async (req, res) => {
  const idEntrada = leerIdEntrada(req.params.id);
  await asegurarTablaDiferencias();

  const entradaResult = await db.query(
    `SELECT
       e.id_entrada,
       e.numero_entrada,
       e.fecha_entrada,
       e.origen AS proveedor,
       e.referencia_externa,
       e.estado,
       e.resultado_verificacion,
       e.stock_confirmado,
       e.observaciones,
       a.codigo AS almacen_codigo,
       a.nombre AS almacen
     FROM entradas_inventario e
     LEFT JOIN almacenes a ON a.id_almacen = e.id_almacen
     WHERE e.id_entrada = $1`,
    [idEntrada],
  );
  if (!entradaResult.rowCount) {
    throw new ApiError(404, "La recepción no existe");
  }

  const detallesResult = await db.query(
    `SELECT
       de.id_detalle_entrada,
       de.id_producto,
       de.cantidad_solicitada,
       de.cantidad_recibida,
       de.estado_verificacion,
       de.observaciones,
       p.codigo AS producto_codigo,
       p.nombre AS producto
     FROM detalle_entradas de
     JOIN productos p ON p.id_producto = de.id_producto
     WHERE de.id_entrada = $1
     ORDER BY de.id_detalle_entrada`,
    [idEntrada],
  );
  const diferencias = await buscarDiferencias(idEntrada);

  res.json({
    ok: true,
    data: {
      ...entradaResult.rows[0],
      detalles: detallesResult.rows,
      diferencias,
    },
  });
});

const listarDiferencias = asyncHandler(async (req, res) => {
  const idEntrada = leerIdEntrada(req.params.id);
  await asegurarTablaDiferencias();

  const entradaResult = await db.query(
    "SELECT id_entrada FROM entradas_inventario WHERE id_entrada = $1",
    [idEntrada],
  );
  if (!entradaResult.rowCount) {
    throw new ApiError(404, "La recepción no existe");
  }

  const diferencias = await buscarDiferencias(idEntrada);
  res.json({ ok: true, data: diferencias });
});

const registrarDiferencia = asyncHandler(async (req, res) => {
  const idEntrada = leerIdEntrada(req.params.id);
  const diferencia = normalizarDiferencia(req.body || {});
  await asegurarTablaDiferencias();

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");

    const entradaResult = await cliente.query(
      "SELECT id_entrada FROM entradas_inventario WHERE id_entrada = $1",
      [idEntrada],
    );
    if (!entradaResult.rowCount) {
      throw new ApiError(404, "La recepción no existe");
    }

    const productoResult = await cliente.query(
      `SELECT id_producto
       FROM detalle_entradas
       WHERE id_entrada = $1 AND id_producto = $2
       LIMIT 1`,
      [idEntrada, diferencia.id_producto],
    );
    if (!productoResult.rowCount) {
      throw new ApiError(400, "El producto no pertenece a esta recepción");
    }

    const insertResult = await cliente.query(
      `INSERT INTO diferencias_recepcion
         (id_entrada, id_producto, tipo, cantidad, observacion, id_usuario)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_diferencia, id_entrada, id_producto, tipo, cantidad,
                 observacion, fecha_registro, id_usuario`,
      [
        idEntrada,
        diferencia.id_producto,
        diferencia.tipo,
        diferencia.cantidad,
        diferencia.observacion,
        req.user.id_usuario,
      ],
    );

    await cliente.query("COMMIT");
    res.status(201).json({
      ok: true,
      message: "Diferencia registrada",
      data: insertResult.rows[0],
    });
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir el registro de la diferencia:", rollbackError);
    }
    throw error;
  } finally {
    cliente.release();
  }
});

module.exports = {
  obtenerRecepcion,
  listarDiferencias,
  registrarDiferencia,
};
