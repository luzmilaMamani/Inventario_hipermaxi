const db = require("../config/db");

// HIP-260: lotes con stock que vencen en menos de dos meses y que todavía no se
// informaron a Producción y Logística. Los vencidos y los que están en
// cuarentena no se informan porque no se pueden usar.
const SQL_LOTES_POR_INFORMAR = `
  SELECT lp.id_lote, lp.numero_lote, lp.cantidad_actual,
         TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         (lp.fecha_vencimiento - CURRENT_DATE) AS dias_restantes,
         p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
         a.id_almacen, a.codigo AS almacen_codigo, a.nombre AS almacen
  FROM lotes_productos lp
  INNER JOIN productos p ON p.id_producto = lp.id_producto
  INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
  WHERE lp.cantidad_actual > 0
    AND lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
    AND lp.fecha_vencimiento > CURRENT_DATE
    AND lp.fecha_vencimiento < CURRENT_DATE + INTERVAL '2 months'
    AND NOT EXISTS (
      SELECT 1 FROM lotes_vencimiento_informados li WHERE li.id_lote = lp.id_lote
    )
  ORDER BY lp.fecha_vencimiento, p.nombre, a.nombre, lp.id_lote`;

// Registra un único evento con todos los lotes que entraron en la ventana desde
// la última revisión. Devuelve cuántos lotes se informaron.
async function informarProductosProximosVencer() {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    // Evita que dos instancias del backend informen los mismos lotes.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('PRODUCTOS_PROXIMOS_VENCER'))");

    const { rows } = await client.query(SQL_LOTES_POR_INFORMAR);
    if (rows.length === 0) {
      await client.query("COMMIT");
      return 0;
    }

    const { rows: evento } = await client.query(
      "INSERT INTO eventos_integracion (tipo_evento, payload) VALUES ($1, $2) RETURNING id_evento",
      [
        "PRODUCTOS_PROXIMOS_VENCER",
        JSON.stringify({
          ventana: "2 meses",
          productos: rows.map((lote) => ({
            id_producto: lote.id_producto,
            producto_codigo: lote.producto_codigo,
            producto: lote.producto,
            id_almacen: lote.id_almacen,
            almacen_codigo: lote.almacen_codigo,
            almacen: lote.almacen,
            id_lote: lote.id_lote,
            numero_lote: lote.numero_lote,
            fecha_vencimiento: lote.fecha_vencimiento,
            dias_restantes: Number(lote.dias_restantes),
            cantidad: Number(lote.cantidad_actual),
          })),
        }),
      ],
    );

    await client.query(
      `INSERT INTO lotes_vencimiento_informados (id_lote, fecha_vencimiento, id_evento)
       SELECT id_lote, fecha_vencimiento, $2 FROM lotes_productos WHERE id_lote = ANY($1::int[])`,
      [rows.map((lote) => lote.id_lote), evento[0].id_evento],
    );

    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { informarProductosProximosVencer };
