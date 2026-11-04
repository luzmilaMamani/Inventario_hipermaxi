ALTER TABLE ajustes_inventario
  ADD COLUMN IF NOT EXISTS comentario TEXT;

ALTER TABLE ajustes_inventario
  ADD COLUMN IF NOT EXISTS id_usuario_aprueba INTEGER;

ALTER TABLE ajustes_inventario
  ADD COLUMN IF NOT EXISTS fecha_ajuste TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE ajustes_inventario
SET fecha_ajuste = CURRENT_TIMESTAMP
WHERE fecha_ajuste IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ajustes_inventario'::regclass
      AND conname = 'fk_ajuste_usuario_aprueba'
  ) THEN
    ALTER TABLE ajustes_inventario
      ADD CONSTRAINT fk_ajuste_usuario_aprueba
      FOREIGN KEY (id_usuario_aprueba) REFERENCES usuarios(id_usuario);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validar_justificacion_ajuste()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.motivo IS NULL OR NEW.motivo NOT IN (
    'CONTEO_FISICO', 'MERMA', 'DANO', 'ERROR_REGISTRO', 'VENCIMIENTO', 'OTRO'
  ) THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio y debe elegirse del catálogo';
  END IF;

  IF NEW.comentario IS NULL OR length(btrim(NEW.comentario)) < 5 THEN
    RAISE EXCEPTION 'El comentario de la justificación es obligatorio (mínimo 5 caracteres)';
  END IF;

  IF NEW.id_usuario IS NULL OR NEW.id_usuario_aprueba IS NULL THEN
    RAISE EXCEPTION 'El ajuste debe quedar asociado al usuario que lo aprueba';
  END IF;

  IF NEW.fecha_ajuste IS NULL THEN
    NEW.fecha_ajuste := CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_justificacion_ajuste ON ajustes_inventario;
CREATE TRIGGER trg_validar_justificacion_ajuste
  BEFORE INSERT ON ajustes_inventario
  FOR EACH ROW
  EXECUTE PROCEDURE validar_justificacion_ajuste();

CREATE OR REPLACE FUNCTION impedir_cambio_ajuste()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Una justificación de ajuste registrada no puede modificarse ni eliminarse';
END;
$$;

DROP TRIGGER IF EXISTS trg_ajuste_inmutable ON ajustes_inventario;
CREATE TRIGGER trg_ajuste_inmutable
  BEFORE UPDATE OR DELETE ON ajustes_inventario
  FOR EACH ROW
  EXECUTE PROCEDURE impedir_cambio_ajuste();
