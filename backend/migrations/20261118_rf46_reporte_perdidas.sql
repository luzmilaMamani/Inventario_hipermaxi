-- RF46 (HIP-215): pérdidas de inventario valorizadas. Une en una sola vista las
-- salidas de tipo PÉRDIDA (RF25), DAÑO (RF26) y VENCIMIENTO (RF27), una fila por
-- línea de detalle, con su motivo y su valor.

CREATE OR REPLACE VIEW vw_reporte_perdidas AS
SELECT
  s.id_salida,
  s.numero_salida,
  s.fecha_salida,
  s.motivo AS tipo_perdida,
  -- Motivo dentro del tipo: el subtipo registrado (robo, extravío, roto...) o,
  -- en vencimientos, la baja por lote vencido.
  COALESCE(
    NULLIF(BTRIM(s.subtipo_perdida), ''),
    CASE WHEN s.motivo = 'VENCIMIENTO' THEN 'LOTE_VENCIDO' ELSE 'SIN_DETALLE' END
  ) AS motivo,
  s.observaciones,
  a.id_almacen,
  a.codigo AS almacen_codigo,
  a.nombre AS almacen,
  u.nombre_completo AS usuario_registra,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  c.id_categoria,
  c.nombre AS categoria,
  um.abreviatura AS unidad,
  lp.numero_lote,
  ds.cantidad,
  ds.precio_unitario,
  (ds.cantidad * ds.precio_unitario)::numeric(14, 2) AS valor_total
FROM salidas_inventario s
INNER JOIN detalle_salidas ds ON ds.id_salida = s.id_salida
INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
INNER JOIN productos p ON p.id_producto = ds.id_producto
INNER JOIN categorias c ON c.id_categoria = p.id_categoria
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
LEFT JOIN lotes_productos lp ON lp.id_lote = ds.id_lote
WHERE s.motivo IN ('PERDIDA', 'DANO', 'VENCIMIENTO')
  AND s.estado <> 'CANCELADA';

-- El reporte filtra por tipo de salida y rango de fechas.
CREATE INDEX IF NOT EXISTS idx_salidas_motivo_fecha
  ON salidas_inventario (motivo, fecha_salida);
