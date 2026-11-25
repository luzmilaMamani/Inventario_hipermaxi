-- Reporte de ajustes para auditoría: cada ajuste con su justificación
-- (comentario), el responsable que lo registró y la aprobación
-- (aprobador, fecha, estado y motivo de rechazo).
-- El valor es el que quedó guardado al registrar el ajuste (diferencia x precio).

CREATE OR REPLACE VIEW vw_reporte_ajustes AS
SELECT
  a.id_ajuste,
  a.numero_ajuste,
  a.fecha_ajuste,
  a.id_almacen,
  al.codigo AS almacen_codigo,
  al.nombre AS almacen,
  a.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  c.id_categoria,
  c.nombre AS categoria,
  (a.cantidad_nueva - a.cantidad_anterior) AS diferencia,
  a.motivo,
  a.comentario AS justificacion,
  a.estado,
  a.requiere_aprobacion,
  a.valor_ajuste,
  a.fecha_aprobacion,
  a.motivo_rechazo,
  a.id_usuario,
  u.nombre_completo AS responsable,
  a.id_usuario_aprueba,
  ua.nombre_completo AS aprobador
FROM ajustes_inventario a
INNER JOIN almacenes al ON al.id_almacen = a.id_almacen
INNER JOIN productos p ON p.id_producto = a.id_producto
LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
INNER JOIN usuarios u ON u.id_usuario = a.id_usuario
LEFT JOIN usuarios ua ON ua.id_usuario = a.id_usuario_aprueba;

CREATE INDEX IF NOT EXISTS idx_ajustes_responsable_fecha
  ON ajustes_inventario (id_usuario, fecha_ajuste DESC);

CREATE INDEX IF NOT EXISTS idx_ajustes_motivo_fecha
  ON ajustes_inventario (motivo, fecha_ajuste DESC);
