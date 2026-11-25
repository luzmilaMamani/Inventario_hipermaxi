const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { esFechaValida } = require("../utils/filtrosReporte");
const { calcularKardex, filtrarPeriodo } = require("../services/kardex");

function leerId(valor, mensaje) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, mensaje);
  return id;
}

function leerFecha(valor, nombre) {
  if (valor === undefined || valor === null || valor === "") return "";
  if (!esFechaValida(valor)) throw new ApiError(400, `La fecha ${nombre} no es válida`);
  return valor;
}

// Kardex valorizado de un producto en un almacén.
// El saldo corre con costo promedio ponderado y el saldo final cuadra con el stock.
const reporteKardex = asyncHandler(async (req, res) => {
  const idProducto = leerId(req.query.id_producto, "Elige un producto");
  const idAlmacen = leerId(req.query.id_almacen, "Elige un almacén");
  const desde = leerFecha(req.query.fecha_desde, "inicial");
  const hasta = leerFecha(req.query.fecha_hasta, "final");
  if (desde && hasta && desde > hasta) {
    throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  }

  const cabecera = await db.query(
    `SELECT
       p.id_producto,
       p.codigo,
       p.nombre,
       COALESCE(p.precio, 0) AS precio,
       um.abreviatura AS unidad,
       a.id_almacen,
       a.codigo AS almacen_codigo,
       a.nombre AS almacen,
       COALESCE(s.cantidad, 0) AS stock_actual
     FROM (SELECT $1::int AS id_producto, $2::int AS id_almacen) pedido
     LEFT JOIN productos p ON p.id_producto = pedido.id_producto
     LEFT JOIN almacenes a ON a.id_almacen = pedido.id_almacen
     LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
     LEFT JOIN stock s ON s.id_producto = p.id_producto AND s.id_almacen = a.id_almacen`,
    [idProducto, idAlmacen],
  );
  const info = cabecera.rows[0];
  if (!info?.id_producto) throw new ApiError(404, "El producto no existe");
  if (!info?.id_almacen) throw new ApiError(404, "El almacén no existe");

  const movimientos = await db.query(
    `SELECT
       id_movimiento,
       fecha_movimiento,
       TO_CHAR(fecha_movimiento, 'YYYY-MM-DD') AS fecha,
       tipo_movimiento,
       cantidad,
       cantidad_neta,
       costo_unitario,
       referencia,
       observaciones
     FROM vw_kardex_movimientos
     WHERE id_producto = $1 AND id_almacen = $2
     ORDER BY fecha_movimiento ASC, id_movimiento ASC`,
    [idProducto, idAlmacen],
  );

  const kardex = calcularKardex(movimientos.rows, {
    stockActual: Number(info.stock_actual),
    precioInicial: Number(info.precio),
  });
  const filas = filtrarPeriodo(kardex.filas, desde, hasta);
  const cierre = filas.length ? filas[filas.length - 1].saldo : 0;

  res.json({
    ok: true,
    producto: {
      id_producto: info.id_producto,
      codigo: info.codigo,
      nombre: info.nombre,
      unidad: info.unidad,
    },
    almacen: {
      id_almacen: info.id_almacen,
      codigo: info.almacen_codigo,
      nombre: info.almacen,
    },
    resumen: {
      stock_actual: Number(info.stock_actual),
      saldo_final: kardex.saldo_final,
      costo_promedio: kardex.costo_promedio,
      saldo_valorizado: kardex.saldo_valorizado,
      saldo_cierre_periodo: cierre,
      cuadra: kardex.saldo_final === Number(info.stock_actual),
      movimientos: movimientos.rows.length,
    },
    data: filas,
  });
});

module.exports = { reporteKardex };
