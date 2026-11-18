-- RF75 (HIP-289): métricas diarias de las integraciones asíncronas por sistema.
--  - ENTRANTE: mensajes que Inventario recibe (mensajes_integracion).
--  - SALIENTE: eventos que Inventario publica (eventos_integracion hacia
--    Producción y Logística; eventos_stock_bajo hacia Compras).
-- Tasa de éxito = exitosos / total. Latencia en milisegundos: publicación →
-- procesamiento para lo que entra; registro → publicación para lo que sale.

CREATE OR REPLACE VIEW vw_metricas_integracion AS
SELECT
  COALESCE(sistema, 'OTRO') AS sistema,
  'ENTRANTE'::text AS direccion,
  fecha_recepcion::date AS dia,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE estado = 'PROCESADO')::int AS exitosos,
  COUNT(*) FILTER (WHERE estado = 'ERROR')::int AS con_error,
  COUNT(*) FILTER (WHERE estado = 'INVALIDO')::int AS invalidos,
  0::int AS pendientes,
  ROUND(AVG(latencia_ms))::int AS latencia_promedio_ms,
  MAX(latencia_ms)::int AS latencia_maxima_ms
FROM mensajes_integracion
GROUP BY 1, 3

UNION ALL

SELECT
  'PRODUCCION_LOGISTICA',
  'SALIENTE',
  fecha_creacion::date,
  COUNT(*)::int,
  COUNT(*) FILTER (WHERE estado = 'PUBLICADO')::int,
  COUNT(*) FILTER (WHERE estado = 'ERROR')::int,
  0,
  COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int,
  ROUND(AVG(EXTRACT(EPOCH FROM (fecha_publicacion - fecha_creacion)) * 1000))::int,
  ROUND(MAX(EXTRACT(EPOCH FROM (fecha_publicacion - fecha_creacion)) * 1000))::int
FROM eventos_integracion
GROUP BY 3

UNION ALL

SELECT
  'COMPRAS',
  'SALIENTE',
  fecha_creacion::date,
  COUNT(*)::int,
  COUNT(*) FILTER (WHERE estado = 'PUBLICADO')::int,
  COUNT(*) FILTER (WHERE estado = 'ERROR')::int,
  0,
  COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int,
  ROUND(AVG(EXTRACT(EPOCH FROM (fecha_publicacion - fecha_creacion)) * 1000))::int,
  ROUND(MAX(EXTRACT(EPOCH FROM (fecha_publicacion - fecha_creacion)) * 1000))::int
FROM eventos_stock_bajo
GROUP BY 3;

-- Mensajes entrantes con error o inválidos, para revisarlos y reprocesarlos.
CREATE OR REPLACE VIEW vw_mensajes_integracion_con_error AS
SELECT
  COALESCE(sistema, 'OTRO') AS sistema,
  tipo_mensaje,
  id_mensaje,
  estado,
  error,
  intentos,
  fecha_recepcion,
  fecha_publicacion,
  payload
FROM mensajes_integracion
WHERE estado IN ('ERROR', 'INVALIDO');

CREATE INDEX IF NOT EXISTS idx_eventos_integracion_fecha ON eventos_integracion (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_eventos_stock_bajo_fecha ON eventos_stock_bajo (fecha_creacion);
