ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE salidas_inventario
  ADD COLUMN IF NOT EXISTS subtipo_perdida VARCHAR(50);

ALTER TABLE detalle_salidas
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW vw_perdidas AS
SELECT
  s.id_salida,
  s.numero_salida,
  s.fecha_salida,
  s.motivo AS tipo_salida,
  s.subtipo_perdida,
  s.observaciones,
  a.id_almacen,
  a.nombre AS almacen,
  a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  c.nombre AS categoria,
  m.nombre AS marca,
  ds.cantidad,
  ds.precio_unitario,
  (ds.cantidad * ds.precio_unitario)::NUMERIC(14,2) AS valor_total,
  um.abreviatura AS unidad
FROM salidas_inventario s
INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
INNER JOIN detalle_salidas ds ON ds.id_salida = s.id_salida
INNER JOIN productos p ON p.id_producto = ds.id_producto
INNER JOIN categorias c ON c.id_categoria = p.id_categoria
LEFT JOIN marcas m ON m.id_marca = p.id_marca
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
WHERE s.motivo = 'PERDIDA';

CREATE OR REPLACE VIEW vw_danos AS
SELECT
  s.id_salida,
  s.numero_salida,
  s.fecha_salida,
  s.motivo AS tipo_salida,
  s.subtipo_perdida AS subtipo_dano,
  s.observaciones,
  a.id_almacen,
  a.nombre AS almacen,
  a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  c.nombre AS categoria,
  m.nombre AS marca,
  ds.cantidad,
  ds.precio_unitario,
  (ds.cantidad * ds.precio_unitario)::NUMERIC(14,2) AS valor_total,
  um.abreviatura AS unidad
FROM salidas_inventario s
INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
INNER JOIN detalle_salidas ds ON ds.id_salida = s.id_salida
INNER JOIN productos p ON p.id_producto = ds.id_producto
INNER JOIN categorias c ON c.id_categoria = p.id_categoria
LEFT JOIN marcas m ON m.id_marca = p.id_marca
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
WHERE s.motivo = 'DANO';

CREATE OR REPLACE VIEW vw_vencimientos AS
SELECT
  s.id_salida,
  s.numero_salida,
  s.fecha_salida,
  s.motivo AS tipo_salida,
  s.observaciones,
  a.id_almacen,
  a.nombre AS almacen,
  a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  c.nombre AS categoria,
  m.nombre AS marca,
  ds.cantidad,
  ds.precio_unitario,
  (ds.cantidad * ds.precio_unitario)::NUMERIC(14,2) AS valor_total,
  um.abreviatura AS unidad,
  lp.numero_lote,
  lp.fecha_vencimiento
FROM salidas_inventario s
INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
INNER JOIN usuarios u ON u.id_usuario = s.id_usuario
INNER JOIN detalle_salidas ds ON ds.id_salida = s.id_salida
INNER JOIN productos p ON p.id_producto = ds.id_producto
INNER JOIN categorias c ON c.id_categoria = p.id_categoria
LEFT JOIN marcas m ON m.id_marca = p.id_marca
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
INNER JOIN lotes_productos lp ON lp.id_lote = ds.id_lote
WHERE s.motivo = 'VENCIMIENTO';

DROP VIEW IF EXISTS vw_transferencias;

CREATE OR REPLACE VIEW vw_transferencias AS
SELECT
  t.id_transferencia,
  t.numero_transferencia,
  t.fecha_solicitud,
  t.fecha_aprobacion,
  t.fecha_envio,
  t.fecha_recepcion,
  t.fecha_llegada_estimada,
  t.fecha_rechazo,
  t.fecha_cancelacion,
  t.estado,
  t.observaciones,
  t.almacen_origen AS id_almacen_origen,
  ao.nombre AS almacen_origen,
  t.almacen_destino AS id_almacen_destino,
  ad.nombre AS almacen_destino,
  t.id_usuario_solicita,
  us.nombre_completo AS solicitante,
  t.id_usuario_aprueba,
  ua.nombre_completo AS aprobador
FROM transferencias t
INNER JOIN almacenes ao ON ao.id_almacen = t.almacen_origen
INNER JOIN almacenes ad ON ad.id_almacen = t.almacen_destino
INNER JOIN usuarios us ON us.id_usuario = t.id_usuario_solicita
LEFT JOIN usuarios ua ON ua.id_usuario = t.id_usuario_aprueba;
