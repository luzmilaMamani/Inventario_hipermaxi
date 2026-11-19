const db = require("../config/db");
const ApiError = require("../utils/apiError");
const { aplicarMensaje } = require("./suscriptorVentas");

// RF75 (HIP-290): métricas de las integraciones asíncronas y reproceso de
// mensajes que quedaron con error.

const NOMBRES_SISTEMA = {
  COMPRAS: "Compras y Proveedores",
  PRODUCCION_LOGISTICA: "Producción y Logística",
  VENTAS: "Ventas (Punto de Venta)",
};

async function metricasPorSistema({ desde, hasta }) {
  const params = [desde, hasta];
  const rango = "dia BETWEEN $1::date AND $2::date";

  const [porSistema, porDia, conError] = await Promise.all([
    db.query(
      `SELECT sistema, direccion,
              SUM(total)::int AS total,
              SUM(exitosos)::int AS exitosos,
              SUM(con_error)::int AS con_error,
              SUM(invalidos)::int AS invalidos,
              SUM(pendientes)::int AS pendientes,
              ROUND(100.0 * SUM(exitosos) / NULLIF(SUM(total), 0), 1) AS tasa_exito,
              -- Promedio ponderado por la cantidad de mensajes de cada día.
              ROUND(SUM(latencia_promedio_ms::numeric * total) FILTER (WHERE latencia_promedio_ms IS NOT NULL)
                    / NULLIF(SUM(total) FILTER (WHERE latencia_promedio_ms IS NOT NULL), 0))::int AS latencia_promedio_ms,
              MAX(latencia_maxima_ms) AS latencia_maxima_ms
       FROM vw_metricas_integracion
       WHERE ${rango}
       GROUP BY sistema, direccion
       ORDER BY sistema, direccion`,
      params,
    ),
    db.query(
      `SELECT TO_CHAR(dia, 'YYYY-MM-DD') AS dia, sistema,
              SUM(total)::int AS total,
              SUM(con_error + invalidos)::int AS con_error
       FROM vw_metricas_integracion
       WHERE ${rango}
       GROUP BY dia, sistema
       ORDER BY dia, sistema`,
      params,
    ),
    db.query(
      `SELECT sistema, tipo_mensaje, id_mensaje, estado, error, intentos,
              fecha_recepcion, payload
       FROM vw_mensajes_integracion_con_error
       WHERE fecha_recepcion >= $1::date AND fecha_recepcion < $2::date + 1
       ORDER BY fecha_recepcion DESC
       LIMIT 200`,
      params,
    ),
  ]);

  // Una tarjeta por sistema con lo que entra y lo que sale.
  const sistemas = new Map();
  for (const fila of porSistema.rows) {
    if (!sistemas.has(fila.sistema)) {
      sistemas.set(fila.sistema, {
        sistema: fila.sistema,
        nombre: NOMBRES_SISTEMA[fila.sistema] || fila.sistema,
        total: 0,
        exitosos: 0,
        con_error: 0,
        invalidos: 0,
        pendientes: 0,
        direcciones: [],
      });
    }
    const s = sistemas.get(fila.sistema);
    for (const campo of ["total", "exitosos", "con_error", "invalidos", "pendientes"]) s[campo] += fila[campo];
    s.direcciones.push(fila);
  }
  const tarjetas = [...sistemas.values()].map((s) => {
    const conLatencia = s.direcciones.filter((d) => d.latencia_promedio_ms !== null);
    const pesos = conLatencia.reduce((acc, d) => acc + d.total, 0);
    return {
      ...s,
      tasa_exito: s.total ? Math.round((1000 * s.exitosos) / s.total) / 10 : null,
      latencia_promedio_ms: pesos
        ? Math.round(conLatencia.reduce((acc, d) => acc + d.latencia_promedio_ms * d.total, 0) / pesos)
        : null,
    };
  });

  const total = tarjetas.reduce((acc, s) => acc + s.total, 0);
  const exitosos = tarjetas.reduce((acc, s) => acc + s.exitosos, 0);

  return {
    periodo: { desde, hasta },
    resumen: {
      total,
      exitosos,
      con_error: tarjetas.reduce((acc, s) => acc + s.con_error + s.invalidos, 0),
      tasa_exito: total ? Math.round((1000 * exitosos) / total) / 10 : null,
    },
    por_sistema: tarjetas,
    por_dia: porDia.rows,
    mensajes_con_error: conError.rows,
  };
}

// Vuelve a procesar un mensaje entrante con ERROR o INVALIDO. Para Ventas se
// reaplica dentro de una transacción; para Producción y Logística se reutiliza su
// procesador (que registra el mensaje de nuevo).
async function reprocesar(tipoMensaje, idMensaje) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM mensajes_integracion
       WHERE tipo_mensaje = $1 AND id_mensaje = $2
       FOR UPDATE`,
      [tipoMensaje, idMensaje],
    );
    const mensaje = rows[0];
    if (!mensaje) throw new ApiError(404, "Mensaje no encontrado");
    if (!["ERROR", "INVALIDO"].includes(mensaje.estado)) {
      throw new ApiError(409, `El mensaje ya está ${mensaje.estado}; solo se reprocesan mensajes con error`);
    }

    if (mensaje.sistema === "VENTAS") {
      const resultado = await aplicarMensaje(client, mensaje.payload, idMensaje);
      await client.query(
        `UPDATE mensajes_integracion
         SET estado = $3, error = $4, intentos = intentos + 1, fecha_procesado = CURRENT_TIMESTAMP
         WHERE tipo_mensaje = $1 AND id_mensaje = $2`,
        [tipoMensaje, idMensaje, resultado.estadoMensaje, resultado.error || null],
      );
      await client.query("COMMIT");
      return { estado: resultado.estadoMensaje, error: resultado.error || null, intentos: mensaje.intentos + 1 };
    }

    if (mensaje.sistema === "PRODUCCION_LOGISTICA") {
      // El procesador de Producción ignora ids ya registrados: se libera el
      // registro y se procesa de nuevo; si falla se restaura.
      await client.query(
        "DELETE FROM mensajes_integracion WHERE tipo_mensaje = $1 AND id_mensaje = $2",
        [tipoMensaje, idMensaje],
      );
      await client.query("COMMIT");
      const { procesarSolicitud, procesarTerminados } = require("./integracionProduccion");
      const procesador = { SOLICITUD_MATERIALES: procesarSolicitud, PRODUCTOS_TERMINADOS: procesarTerminados }[tipoMensaje];
      try {
        if (!procesador) throw new Error(`No hay procesador para ${tipoMensaje}`);
        await procesador(mensaje.payload, idMensaje);
      } catch (error) {
        await db.query(
          `INSERT INTO mensajes_integracion
             (tipo_mensaje, id_mensaje, payload, estado, error, fecha_recepcion, sistema, fecha_publicacion, intentos)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT DO NOTHING`,
          [tipoMensaje, idMensaje, mensaje.payload, mensaje.estado, error.message, mensaje.fecha_recepcion,
            mensaje.sistema, mensaje.fecha_publicacion, mensaje.intentos + 1],
        );
        throw new ApiError(502, `No se pudo reprocesar: ${error.message}`);
      }
      const { rows: nuevo } = await db.query(
        `UPDATE mensajes_integracion
         SET intentos = $3, fecha_recepcion = $4
         WHERE tipo_mensaje = $1 AND id_mensaje = $2
         RETURNING estado, error`,
        [tipoMensaje, idMensaje, mensaje.intentos + 1, mensaje.fecha_recepcion],
      );
      return { estado: nuevo[0]?.estado, error: nuevo[0]?.error || null, intentos: mensaje.intentos + 1 };
    }

    throw new ApiError(400, `Los mensajes de ${mensaje.sistema || "este sistema"} no se pueden reprocesar`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { metricasPorSistema, reprocesar, NOMBRES_SISTEMA };
