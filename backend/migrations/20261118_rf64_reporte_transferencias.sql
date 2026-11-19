-- RF64 (HIP-226): transferencias entre sucursales con sus fechas, tiempo de
-- entrega (envío → recepción) y diferencias recibidas, una fila por transferencia.

CREATE OR REPLACE VIEW vw_reporte_transferencias AS
SELECT
  t.id_transferencia,
  t.numero_transferencia,
  t.estado,
  t.almacen_origen AS id_almacen_origen,
  ao.nombre AS almacen_origen,
  t.almacen_destino AS id_almacen_destino,
  ad.nombre AS almacen_destino,
  us.nombre_completo AS solicitante,
  t.fecha_solicitud,
  t.fecha_aprobacion,
  t.fecha_envio,
  t.fecha_recepcion,
  t.fecha_llegada_estimada,
  t.fecha_cancelacion,
  t.motivo_cancelacion,
  -- Tiempo de entrega en horas: solo cuando ya se recibió.
  CASE
    WHEN t.fecha_envio IS NOT NULL AND t.fecha_recepcion IS NOT NULL
      THEN ROUND((EXTRACT(EPOCH FROM (t.fecha_recepcion - t.fecha_envio)) / 3600)::numeric, 1)
  END AS horas_entrega,
  CASE
    WHEN t.fecha_recepcion IS NOT NULL AND t.fecha_llegada_estimada IS NOT NULL
      THEN t.fecha_recepcion::date <= t.fecha_llegada_estimada
  END AS a_tiempo,
  d.lineas,
  d.unidades_solicitadas,
  d.unidades_enviadas,
  d.unidades_recibidas,
  d.diferencia_unidades,
  d.lineas_con_diferencia,
  d.valor_diferencia
FROM transferencias t
INNER JOIN almacenes ao ON ao.id_almacen = t.almacen_origen
INNER JOIN almacenes ad ON ad.id_almacen = t.almacen_destino
INNER JOIN usuarios us ON us.id_usuario = t.id_usuario_solicita
CROSS JOIN LATERAL (
  SELECT
    COUNT(*)::int AS lineas,
    COALESCE(SUM(dt.cantidad_solicitada), 0) AS unidades_solicitadas,
    COALESCE(SUM(dt.cantidad_enviada), 0) AS unidades_enviadas,
    COALESCE(SUM(dt.cantidad_recibida), 0) AS unidades_recibidas,
    COALESCE(SUM(COALESCE(dt.diferencia, 0)), 0) AS diferencia_unidades,
    COUNT(*) FILTER (WHERE COALESCE(dt.diferencia, 0) <> 0)::int AS lineas_con_diferencia,
    COALESCE(SUM(COALESCE(dt.diferencia, 0) * COALESCE(p.precio, 0)), 0)::numeric(14, 2) AS valor_diferencia
  FROM detalle_transferencias dt
  INNER JOIN productos p ON p.id_producto = dt.id_producto
  WHERE dt.id_transferencia = t.id_transferencia
) d;

-- El reporte filtra por fecha de solicitud.
CREATE INDEX IF NOT EXISTS idx_transferencias_fecha_solicitud
  ON transferencias (fecha_solicitud);
