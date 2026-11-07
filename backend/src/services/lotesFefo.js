const ApiError = require("../utils/apiError");

// RF49: un lote es vigente si tiene existencia, no está bloqueado/vencido/agotado
// y su fecha de vencimiento es posterior a hoy. Un lote que vence hoy ya se
// trata como vencido (igual que en las salidas por VENCIMIENTO).
const SQL_LOTES_VIGENTES = `
  SELECT id_lote, numero_lote,
         TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso,
         TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         cantidad_actual, estado
  FROM lotes_productos lp
  WHERE id_producto = $1
    AND id_almacen = $2
    AND cantidad_actual > 0
    AND estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
    AND (lp.fecha_vencimiento IS NULL OR lp.fecha_vencimiento > CURRENT_DATE)
  ORDER BY lp.fecha_vencimiento ASC NULLS LAST, lp.fecha_ingreso ASC, lp.id_lote ASC`;

async function obtenerLotesVigentes(client, { id_producto, id_almacen, bloquear = false }) {
  const result = await client.query(
    bloquear ? `${SQL_LOTES_VIGENTES} FOR UPDATE` : SQL_LOTES_VIGENTES,
    [id_producto, id_almacen],
  );
  return result.rows;
}

// Reparte la cantidad entre los lotes en el orden recibido (FEFO): consume el
// lote que vence antes y completa con los siguientes.
function planificarFefo(lotes, cantidad) {
  const asignaciones = [];
  let pendiente = cantidad;

  for (const lote of lotes) {
    if (pendiente <= 0) break;
    const tomar = Math.min(Number(lote.cantidad_actual), pendiente);
    if (tomar <= 0) continue;
    asignaciones.push({ lote, cantidad: tomar });
    pendiente -= tomar;
  }

  return { asignaciones, faltante: pendiente };
}

// Resuelve qué lote(s) usar en una línea de salida. Sin id_lote se aplica FEFO;
// con id_lote se usa ese lote completo y, si no es el sugerido, se exige
// justificación.
async function asignarLotes(client, { id_producto, id_almacen, cantidad, id_lote, justificacion_lote }) {
  const lotes = await obtenerLotesVigentes(client, { id_producto, id_almacen, bloquear: true });
  const sugerido = lotes[0] || null;

  if (!id_lote) {
    const { asignaciones, faltante } = planificarFefo(lotes, cantidad);
    if (faltante > 0) {
      const disponible = cantidad - faltante;
      throw new ApiError(
        400,
        `El producto ${id_producto} no tiene suficiente cantidad en lotes vigentes. Disponible: ${disponible}, solicitado: ${cantidad}`,
      );
    }
    return asignaciones.map((a) => ({ ...a, id_lote_sugerido: a.lote.id_lote, justificacion_lote: null }));
  }

  const lote = lotes.find((l) => Number(l.id_lote) === Number(id_lote));
  if (!lote) {
    throw new ApiError(
      400,
      `El lote ${id_lote} no está vigente para el producto ${id_producto} en este almacén (vencido, bloqueado o sin existencia)`,
    );
  }
  if (Number(lote.cantidad_actual) < cantidad) {
    throw new ApiError(
      400,
      `El lote ${lote.numero_lote} no tiene cantidad suficiente. Disponible: ${Number(lote.cantidad_actual)}, solicitado: ${cantidad}`,
    );
  }

  const esSugerido = Number(sugerido.id_lote) === Number(lote.id_lote);
  const justificacion = justificacion_lote ? String(justificacion_lote).trim() : "";
  if (!esSugerido && justificacion.length < 5) {
    throw new ApiError(
      400,
      `Para usar el lote ${lote.numero_lote} en lugar del sugerido (${sugerido.numero_lote}) debe justificar el motivo (mínimo 5 caracteres)`,
    );
  }

  return [
    {
      lote,
      cantidad,
      id_lote_sugerido: sugerido.id_lote,
      justificacion_lote: esSugerido ? null : justificacion,
    },
  ];
}

module.exports = { obtenerLotesVigentes, planificarFefo, asignarLotes };
