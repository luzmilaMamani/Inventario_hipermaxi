-- RF49: selección de lotes FEFO (First Expired, First Out) en salidas y ventas.
-- Cada línea de detalle_salidas ya referencia el lote usado (id_lote). Una
-- salida que consume varios lotes genera una línea por lote. Aquí se registra
-- además el lote que sugirió el sistema y la justificación cuando el usuario
-- elige otro lote.

ALTER TABLE detalle_salidas
  ADD COLUMN IF NOT EXISTS id_lote_sugerido INTEGER,
  ADD COLUMN IF NOT EXISTS justificacion_lote TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.detalle_salidas'::regclass
      AND conname = 'fk_detalle_salida_lote_sugerido'
  ) THEN
    ALTER TABLE detalle_salidas
      ADD CONSTRAINT fk_detalle_salida_lote_sugerido
      FOREIGN KEY (id_lote_sugerido) REFERENCES lotes_productos(id_lote);
  END IF;

  -- Si se usó un lote distinto al sugerido, la justificación es obligatoria.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.detalle_salidas'::regclass
      AND conname = 'chk_detalle_salida_justificacion_lote'
  ) THEN
    ALTER TABLE detalle_salidas
      ADD CONSTRAINT chk_detalle_salida_justificacion_lote
      CHECK (
        id_lote_sugerido IS NULL
        OR id_lote_sugerido = id_lote
        OR length(trim(coalesce(justificacion_lote, ''))) >= 5
      );
  END IF;
END;
$$;

-- Lotes vigentes con existencia, en orden FEFO, por producto y almacén.
CREATE INDEX IF NOT EXISTS idx_lotes_fefo_vigentes
  ON lotes_productos (id_producto, id_almacen, fecha_vencimiento NULLS LAST, fecha_ingreso, id_lote)
  WHERE cantidad_actual > 0 AND estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER');
