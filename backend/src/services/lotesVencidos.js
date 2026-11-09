const ApiError = require("../utils/apiError");

// RF43: un lote está vencido si su estado es VENCIDO o si su fecha ya pasó
// (incluye hoy) aunque el proceso programado aún no lo haya marcado.
const CONDICION_LOTE_VENCIDO = `
  lp.cantidad_actual > 0
  AND (
    lp.estado = 'VENCIDO'
    OR (
      lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
      AND lp.fecha_vencimiento IS NOT NULL
      AND lp.fecha_vencimiento <= CURRENT_DATE
    )
  )`;

async function marcarLotesVencidos(client) {
  const { rows } = await client.query("SELECT fn_marcar_lotes_vencidos() AS marcados");
  return Number(rows[0]?.marcados || 0);
}

// Unidades vencidas o en cuarentena de un producto en un almacén (RF43, RF61).
async function obtenerCantidadNoDisponible(client, id_producto, id_almacen) {
  const { rows } = await client.query(
    "SELECT fn_cantidad_no_disponible($1, $2) AS cantidad",
    [id_producto, id_almacen],
  );
  return Number(rows[0]?.cantidad || 0);
}

// Lotes vencidos de un producto en un almacén, del más antiguo al más reciente.
async function obtenerLotesVencidos(client, { id_producto, id_almacen, bloquear = false }) {
  const { rows } = await client.query(
    `SELECT lp.id_lote, lp.numero_lote,
            TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
            lp.cantidad_actual, lp.estado
     FROM lotes_productos lp
     WHERE lp.id_producto = $1
       AND lp.id_almacen = $2
       AND ${CONDICION_LOTE_VENCIDO}
     ORDER BY lp.fecha_vencimiento ASC NULLS LAST, lp.id_lote ASC
     ${bloquear ? "FOR UPDATE" : ""}`,
    [id_producto, id_almacen],
  );
  return rows;
}

// Resuelve los lotes de una línea de salida por VENCIMIENTO. Con id_lote se da
// de baja ese lote (debe estar vencido); sin id_lote se recorren los lotes
// vencidos empezando por el más antiguo.
async function asignarLotesVencidos(client, { id_producto, id_almacen, cantidad, id_lote }) {
  const lotes = await obtenerLotesVencidos(client, { id_producto, id_almacen, bloquear: true });

  if (id_lote) {
    const lote = lotes.find((l) => Number(l.id_lote) === Number(id_lote));
    if (!lote) {
      throw new ApiError(
        400,
        `El lote ${id_lote} no está vencido o no tiene existencia para el producto ${id_producto} en este almacén`,
      );
    }
    if (Number(lote.cantidad_actual) < cantidad) {
      throw new ApiError(
        400,
        `El lote ${lote.numero_lote} solo tiene ${Number(lote.cantidad_actual)} unidades vencidas; solicitado: ${cantidad}`,
      );
    }
    return [{ lote, cantidad, id_lote_sugerido: null, justificacion_lote: null }];
  }

  const asignaciones = [];
  let pendiente = cantidad;
  for (const lote of lotes) {
    if (pendiente <= 0) break;
    const tomar = Math.min(Number(lote.cantidad_actual), pendiente);
    if (tomar <= 0) continue;
    asignaciones.push({ lote, cantidad: tomar, id_lote_sugerido: null, justificacion_lote: null });
    pendiente -= tomar;
  }

  if (pendiente > 0) {
    throw new ApiError(
      400,
      `El producto ${id_producto} no tiene suficientes unidades vencidas para dar de baja. Vencidas: ${cantidad - pendiente}, solicitado: ${cantidad}`,
    );
  }
  return asignaciones;
}

module.exports = {
  CONDICION_LOTE_VENCIDO,
  marcarLotesVencidos,
  obtenerCantidadNoDisponible,
  obtenerLotesVencidos,
  asignarLotesVencidos,
};
