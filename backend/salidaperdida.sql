/* ============================================================
   RF25 — SALIDAS POR PÉRDIDA
   Migración única para chuby_hipermaxi
   Ejecutar UNA sola vez en pgAdmin (F5) o con psql
   Es idempotente: si lo corres dos veces no rompe nada.
   ============================================================ */

BEGIN;

/* ------------------------------------------------------------
   1. Subcategorías: NO se toca, ya existe la tabla.
   ------------------------------------------------------------ */


/* ------------------------------------------------------------
   2. SALIDAS_INVENTARIO
      - Agregar subtipo_perdida
      - Constraint de valores válidos
      - Observación obligatoria cuando motivo = 'PERDIDA'
   ------------------------------------------------------------ */

ALTER TABLE salidas_inventario
  ADD COLUMN IF NOT EXISTS subtipo_perdida VARCHAR(50);

ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_subtipo_perdida;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_subtipo_perdida
  CHECK (
    subtipo_perdida IS NULL
    OR subtipo_perdida IN ('ROBO', 'EXTRAVIO', 'DETERIORO', 'VENCIMIENTO', 'OTRO')
  );

ALTER TABLE salidas_inventario
  DROP CONSTRAINT IF EXISTS chk_observacion_perdida;

ALTER TABLE salidas_inventario
  ADD CONSTRAINT chk_observacion_perdida
  CHECK (
    motivo <> 'PERDIDA'
    OR (observaciones IS NOT NULL AND LENGTH(BTRIM(observaciones)) >= 5)
  );


/* ------------------------------------------------------------
   3. DETALLE_SALIDAS
      - Agregar columnas de valorización (por si luego se usan)
   ------------------------------------------------------------ */

ALTER TABLE detalle_salidas
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2) DEFAULT 0;


/* ------------------------------------------------------------
   4. MOVIMIENTOS_INVENTARIO
      - Ampliar el CHECK para aceptar 'SALIDA_PERDIDA'
   ------------------------------------------------------------ */

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
      'SALIDA_PERDIDA'
    )
  );


/* ------------------------------------------------------------
   5. Índice para acelerar reportes de pérdidas
   ------------------------------------------------------------ */

CREATE INDEX IF NOT EXISTS idx_salidas_motivo_fecha
  ON salidas_inventario (motivo, fecha_salida DESC);


/* ------------------------------------------------------------
   6. Vista de pérdidas (RF46)
      - Reutiliza el campo `motivo` (no `tipo_salida`)
      - Expone tipo_salida como alias para el backend
   ------------------------------------------------------------ */

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
  ds.valor_total,
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

COMMIT;


/* ============================================================
   VERIFICACIÓN (ejecutar después del COMMIT)
   ============================================================ */

-- 1) Columna nueva
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'salidas_inventario'
  AND column_name = 'subtipo_perdida';

-- 2) Constraints creados
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname IN (
  'chk_subtipo_perdida',
  'chk_observacion_perdida',
  'chk_tipo_movimiento'
);

-- 3) Vista creada
SELECT * FROM vw_perdidas LIMIT 1;

-- 4) Movimientos acepta SALIDA_PERDIDA
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_tipo_movimiento';