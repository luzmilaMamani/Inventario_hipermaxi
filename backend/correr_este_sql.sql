

BEGIN;

/* ============================================================
   1. PRODUCTOS — Agregar precio unitario
   ============================================================ */

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE productos
  DROP CONSTRAINT IF EXISTS chk_producto_precio;

ALTER TABLE productos
  ADD CONSTRAINT chk_producto_precio
  CHECK (precio >= 0);


/* ============================================================
   2. SALIDAS_INVENTARIO — Subtipo + observaciones obligatorias
   ============================================================ */

-- 2.1 Subtipo de pérdida/daño (columna compartida)
ALTER TABLE salidas_inventario
  ADD COLUMN IF NOT EXISTS subtipo_perdida VARCHAR(50);

-- 2.2 Limpiar subtipos que ya no se usan (si existieran)
UPDATE salidas_inventario
SET subtipo_perdida = 'OTRO'
WHERE subtipo_perdida IS NOT NULL
  AND subtipo_perdida NOT IN (
    'ROBO', 'EXTRAVIO',
    'ROTO', 'DETERIORO', 'INUTILIZABLE',
    'OTRO'
  );

-- 2.3 Reemplazar constraint de subtipo (subtipos limpios)
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

-- 2.4 Observación obligatoria para PÉRDIDA (RF25)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_perdida;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_perdida
  CHECK (
    motivo <> 'PERDIDA'
    OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5)
  );

-- 2.5 Observación obligatoria para DAÑO (RF26)
ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_dano;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_dano
  CHECK (
    motivo <> 'DANO'
    OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5)
  );


/* ============================================================
   3. DETALLE_SALIDAS — Valorización
   ============================================================ */

ALTER TABLE detalle_salidas
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2) DEFAULT 0;


/* ============================================================
   4. MOVIMIENTOS_INVENTARIO — Ampliar tipos permitidos
   ============================================================ */

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_tipo_movimiento;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_tipo_movimiento
  CHECK (
    tipo_movimiento IN (
      'ENTRADA',
      'SALIDA',
      'TRANSFERENCIA',
      'AJUSTE',
      'VENTA',
      'DEVOLUCION',
      'SALIDA_PERDIDA',
      'SALIDA_DANO'
    )
  );


/* ============================================================
   5. ÍNDICES — Acelerar reportes
   ============================================================ */

CREATE INDEX IF NOT EXISTS idx_salidas_motivo_fecha
  ON salidas_inventario (motivo, fecha_salida DESC);

CREATE INDEX IF NOT EXISTS idx_salidas_motivo_dano
  ON salidas_inventario (motivo, fecha_salida DESC)
  WHERE motivo = 'DANO';


/* ============================================================
   6. VISTAS DE REPORTES
   ============================================================ */

-- 6.1 Eliminar vistas anteriores (por si cambia el tipo de alguna columna)
DROP VIEW IF EXISTS vw_perdidas;
DROP VIEW IF EXISTS vw_danos;

-- 6.2 Vista de pérdidas (RF25 → RF46)
CREATE VIEW vw_perdidas AS
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

-- 6.3 Vista de daños (RF26 → RF46)
CREATE VIEW vw_danos AS
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

COMMIT;


/* ============================================================
   VERIFICACIÓN — Ejecutar después del COMMIT
   ============================================================ */

-- 1) Columna precio en productos
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'productos' AND column_name = 'precio';

-- 2) Columna subtipo_perdida en salidas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'salidas_inventario' AND column_name = 'subtipo_perdida';

-- 3) Constraints creadas
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN (
  'chk_producto_precio',
  'chk_subtipo_perdida',
  'chk_observacion_perdida',
  'chk_observacion_dano',
  'chk_tipo_movimiento'
);

-- 4) Vistas creadas
SELECT viewname FROM pg_views WHERE viewname IN ('vw_perdidas', 'vw_danos');

-- 5) Columnas de valorización en detalle_salidas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'detalle_salidas'
  AND column_name IN ('precio_unitario', 'valor_total');