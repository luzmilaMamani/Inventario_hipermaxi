-- Se aplica después de 20261118_rf62_vistas_indicadores.sql: usa vw_movimientos_valorizados.
-- RF45 (HIP-212): movimientos de inventario de todos los tipos (entradas,
-- salidas, transferencias y ajustes) en una sola consulta, sobre el historial de
-- existencias (RF18). Cada fila indica si sumó o restó stock, quién lo hizo y el
-- motivo.

CREATE OR REPLACE VIEW vw_reporte_movimientos AS
SELECT
  mv.id_movimiento,
  mv.fecha_movimiento,
  mv.tipo_movimiento,
  -- Agrupación para filtrar y totalizar.
  CASE
    WHEN mv.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'ANULACION_VENTA') THEN 'ENTRADA'
    WHEN mv.tipo_movimiento = 'TRANSFERENCIA' THEN 'TRANSFERENCIA'
    WHEN mv.tipo_movimiento = 'AJUSTE' THEN 'AJUSTE'
    ELSE 'SALIDA'
  END AS grupo,
  CASE WHEN mv.signo > 0 THEN 'INGRESO' WHEN mv.signo < 0 THEN 'EGRESO' ELSE 'SIN_CAMBIO' END AS sentido,
  mv.cantidad,
  mv.cantidad_neta,
  mv.valor,
  m.stock_anterior,
  m.stock_nuevo,
  mv.referencia,
  -- Motivo: el de la salida (venta, pérdida...) o la observación registrada.
  COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' · ', s.motivo, NULLIF(BTRIM(s.subtipo_perdida), ''))), ''),
    NULLIF(BTRIM(mv.observaciones), '')
  ) AS motivo,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  um.abreviatura AS unidad,
  a.id_almacen,
  a.nombre AS almacen,
  lp.numero_lote,
  u.id_usuario,
  COALESCE(u.nombre_completo, 'Sistema / integración') AS usuario
FROM vw_movimientos_valorizados mv
INNER JOIN movimientos_inventario m ON m.id_movimiento = mv.id_movimiento
INNER JOIN productos p ON p.id_producto = mv.id_producto
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
INNER JOIN almacenes a ON a.id_almacen = mv.id_almacen
LEFT JOIN lotes_productos lp ON lp.id_lote = mv.id_lote
LEFT JOIN usuarios u ON u.id_usuario = mv.id_usuario
LEFT JOIN salidas_inventario s ON s.numero_salida = mv.referencia;

-- Filtro por producto y período.
CREATE INDEX IF NOT EXISTS idx_movimientos_producto_fecha
  ON movimientos_inventario (id_producto, fecha_movimiento);
