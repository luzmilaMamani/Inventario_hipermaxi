ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS perecible BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS requiere_refrigeracion BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ubicaciones
  ADD COLUMN IF NOT EXISTS tipo_ubicacion VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ubicaciones'::regclass
      AND conname = 'chk_ubicaciones_tipo_ubicacion'
  ) THEN
    ALTER TABLE ubicaciones
      ADD CONSTRAINT chk_ubicaciones_tipo_ubicacion
      CHECK (tipo_ubicacion IN ('NORMAL', 'FRIO'));
  END IF;
END;
$$;
