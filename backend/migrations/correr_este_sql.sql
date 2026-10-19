BEGIN;

/* ------------------------------------------------------------
   1. PRECIO EN PRODUCTOS (Para valorizar reportes)
   ------------------------------------------------------------ */
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE productos
  DROP CONSTRAINT IF EXISTS chk_producto_precio;

ALTER TABLE productos
  ADD CONSTRAINT chk_producto_precio
  CHECK (precio >= 0);


/* ------------------------------------------------------------
   2. SALIDAS_INVENTARIO (Subtipos y Motivos)
   ------------------------------------------------------------ */
ALTER TABLE salidas_inventario
  ADD COLUMN IF NOT EXISTS subtipo_perdida VARCHAR(50);

-- Limpiar subtipos viejos que ya no se usan (ej. si tenías VENCIMIENTO como subtipo)
UPDATE salidas_inventario
SET subtipo_perdida = 'OTRO'
WHERE subtipo_perdida IS NOT NULL
  AND subtipo_perdida NOT IN (
    'ROBO', 'EXTRAVIO',
    'ROTO', 'DETERIORO', 'INUTILIZABLE',
    'OTRO'
  );

-- Constraint de subtipos (Pérdida y Daño)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_subtipo_perdida;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_subtipo_perdida
  CHECK (
    subtipo_perdida IS NULL
    OR subtipo_perdida IN (
      'ROBO', 'EXTRAVIO',
      'ROTO', 'DETERIORO', 'INUTILIZABLE',
      'OTRO'
    )
  );

-- Constraint de motivos permitidos (RF28)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_motivo_salida;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_motivo_salida
  CHECK (
    motivo IN (
      'VENTA', 'PERDIDA', 'DANO', 'VENCIMIENTO',
      'TRANSFERENCIA', 'AJUSTE', 'OTRO'
    )
  );

-- Observación obligatoria para PÉRDIDA (RF25)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_perdida;
ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_perdida
  CHECK (motivo <> 'PERDIDA' OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5));

-- Observación obligatoria para DAÑO (RF26)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_dano;
ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_dano
  CHECK (motivo <> 'DANO' OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5));

-- Observación obligatoria para VENCIMIENTO (RF27)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_vencimiento;
ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_vencimiento
  CHECK (motivo <> 'VENCIMIENTO' OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5));

-- Observación obligatoria para OTRO (RF28)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_otro;
ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_otro
  CHECK (motivo <> 'OTRO' OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5));


/* ------------------------------------------------------------
   3. VALORIZACIÓN EN DETALLE_SALIDAS
   ------------------------------------------------------------ */
ALTER TABLE detalle_salidas
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2) DEFAULT 0;


/* ------------------------------------------------------------
   4. MOVIMIENTOS_INVENTARIO (Ampliar tipos de movimiento)
   ------------------------------------------------------------ */
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_tipo_movimiento;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_tipo_movimiento
  CHECK (
    tipo_movimiento IN (
      'ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE',
      'VENTA', 'DEVOLUCION', 'SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO'
    )
  );


/* ------------------------------------------------------------
   5. ÍNDICES (Optimización de reportes)
   ------------------------------------------------------------ */
CREATE INDEX IF NOT EXISTS idx_salidas_motivo_fecha
  ON salidas_inventario (motivo, fecha_salida DESC);

CREATE INDEX IF NOT EXISTS idx_salidas_motivo_dano
  ON salidas_inventario (motivo, fecha_salida DESC)
  WHERE motivo = 'DANO';

CREATE INDEX IF NOT EXISTS idx_salidas_motivo_vencimiento
  ON salidas_inventario (motivo, fecha_salida DESC)
  WHERE motivo = 'VENCIMIENTO';


/* ------------------------------------------------------------
   6. VISTAS DE REPORTES
   ------------------------------------------------------------ */
DROP VIEW IF EXISTS vw_perdidas;
DROP VIEW IF EXISTS vw_danos;
DROP VIEW IF EXISTS vw_vencimientos;

-- Vista de pérdidas (RF25 / RF46)
CREATE VIEW vw_perdidas AS
SELECT
  s.id_salida, s.numero_salida, s.fecha_salida, s.motivo AS tipo_salida,
  s.subtipo_perdida, s.observaciones,
  a.id_almacen, a.nombre AS almacen, a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
  c.nombre AS categoria, m.nombre AS marca,
  ds.cantidad, ds.precio_unitario,
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

-- Vista de daños (RF26)
CREATE VIEW vw_danos AS
SELECT
  s.id_salida, s.numero_salida, s.fecha_salida, s.motivo AS tipo_salida,
  s.subtipo_perdida AS subtipo_dano, s.observaciones,
  a.id_almacen, a.nombre AS almacen, a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
  c.nombre AS categoria, m.nombre AS marca,
  ds.cantidad, ds.precio_unitario,
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

-- Vista de vencimientos (RF27)
CREATE VIEW vw_vencimientos AS
SELECT
  s.id_salida, s.numero_salida, s.fecha_salida, s.motivo AS tipo_salida,
  s.observaciones,
  a.id_almacen, a.nombre AS almacen, a.codigo AS almacen_codigo,
  u.nombre_completo AS usuario_registra,
  p.id_producto, p.codigo AS producto_codigo, p.nombre AS producto,
  c.nombre AS categoria, m.nombre AS marca,
  ds.cantidad, ds.precio_unitario,
  (ds.cantidad * ds.precio_unitario)::NUMERIC(14,2) AS valor_total,
  um.abreviatura AS unidad,
  lp.numero_lote, lp.fecha_vencimiento
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

COMMIT;


//comando extra para probar la parte de vencimientos
UPDATE lotes_productos 
SET fecha_ingreso = CURRENT_DATE - INTERVAL '60 days',
    fecha_vencimiento = CURRENT_DATE - INTERVAL '5 days'
WHERE numero_lote = 'LOTE-ARROZ-001';