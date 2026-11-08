-- RF58: diferencias al recibir una transferencia.
-- El almacén de destino registra por producto lo realmente recibido y una
-- observación; la diferencia (recibido - enviado) queda guardada para que el
-- almacén de origen pueda consultarla. Una transferencia con al menos una
-- línea con diferencia queda en estado RECIBIDA_CON_DIFERENCIAS.

-- Diferencia por línea: negativa = faltante, positiva = sobrante.
-- NULL mientras la transferencia no se recibe.
ALTER TABLE detalle_transferencias
  ADD COLUMN IF NOT EXISTS diferencia NUMERIC(12, 2);

-- Quién recibió y la observación general de la recepción.
ALTER TABLE transferencias
  ADD COLUMN IF NOT EXISTS id_usuario_recibe INTEGER REFERENCES usuarios (id_usuario),
  ADD COLUMN IF NOT EXISTS observaciones_recepcion TEXT;

-- Nuevo estado RECIBIDA_CON_DIFERENCIAS.
ALTER TABLE transferencias
  DROP CONSTRAINT IF EXISTS chk_transferencia_estado;

ALTER TABLE transferencias
  ADD CONSTRAINT chk_transferencia_estado
  CHECK (
    estado IN (
      'SOLICITADA', 'APROBADA', 'RECHAZADA', 'ENVIADA',
      'RECIBIDA', 'RECIBIDA_CON_DIFERENCIAS', 'CANCELADA'
    )
  );

-- Transferencias recibidas antes de RF58: se calcula su diferencia.
UPDATE detalle_transferencias dt
SET diferencia = dt.cantidad_recibida - dt.cantidad_enviada
FROM transferencias t
WHERE t.id_transferencia = dt.id_transferencia
  AND t.estado = 'RECIBIDA'
  AND dt.diferencia IS NULL;

UPDATE transferencias t
SET estado = 'RECIBIDA_CON_DIFERENCIAS'
WHERE t.estado = 'RECIBIDA'
  AND EXISTS (
    SELECT 1 FROM detalle_transferencias dt
    WHERE dt.id_transferencia = t.id_transferencia
      AND dt.diferencia <> 0
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.detalle_transferencias'::regclass
      AND conname = 'chk_detalle_transferencias_diferencia'
  ) THEN
    -- La diferencia siempre corresponde a recibido - enviado.
    ALTER TABLE detalle_transferencias
      ADD CONSTRAINT chk_detalle_transferencias_diferencia
      CHECK (diferencia IS NULL OR diferencia = cantidad_recibida - cantidad_enviada);
  END IF;

  -- Toda línea con diferencia debe explicar el faltante o sobrante.
  -- NOT VALID: no se revalidan recepciones anteriores a RF58.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.detalle_transferencias'::regclass
      AND conname = 'chk_detalle_transferencias_diferencia_observada'
  ) THEN
    ALTER TABLE detalle_transferencias
      ADD CONSTRAINT chk_detalle_transferencias_diferencia_observada
      CHECK (
        diferencia IS NULL
        OR diferencia = 0
        OR NULLIF(BTRIM(observaciones), '') IS NOT NULL
      )
      NOT VALID;
  END IF;
END;
$$;

-- Consulta de diferencias por el almacén de origen.
CREATE INDEX IF NOT EXISTS idx_transferencias_con_diferencias
  ON transferencias (almacen_origen, fecha_recepcion DESC)
  WHERE estado = 'RECIBIDA_CON_DIFERENCIAS';
