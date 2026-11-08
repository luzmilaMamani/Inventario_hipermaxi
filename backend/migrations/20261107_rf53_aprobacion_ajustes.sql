-- RF53: aprobación de ajustes que superan un límite de cantidad o monto.
-- Estados del ajuste:
--   APLICADO  -> bajo el límite, se aplicó directamente al stock.
--   PENDIENTE -> supera el límite, espera aprobación y NO modifica el stock.
--   APROBADO  -> un supervisor lo aprobó y se aplicó al stock.
--   RECHAZADO -> un supervisor lo rechazó indicando el motivo; el stock no cambia.

ALTER TABLE ajustes_inventario
  ADD COLUMN IF NOT EXISTS requiere_aprobacion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS valor_ajuste NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

ALTER TABLE ajustes_inventario
  DROP CONSTRAINT IF EXISTS chk_ajuste_estado;
ALTER TABLE ajustes_inventario
  ADD CONSTRAINT chk_ajuste_estado
  CHECK (estado IN ('APLICADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO'));

ALTER TABLE ajustes_inventario
  DROP CONSTRAINT IF EXISTS chk_ajuste_motivo_rechazo;
ALTER TABLE ajustes_inventario
  ADD CONSTRAINT chk_ajuste_motivo_rechazo
  CHECK (estado <> 'RECHAZADO' OR length(btrim(coalesce(motivo_rechazo, ''))) >= 5);

CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_pendientes
  ON ajustes_inventario (fecha_ajuste)
  WHERE estado = 'PENDIENTE';

-- Límite configurable (una sola fila). Un ajuste requiere aprobación si la
-- diferencia en unidades supera limite_cantidad o si su valor (diferencia x
-- precio del producto) supera limite_monto.
CREATE TABLE IF NOT EXISTS parametros_aprobacion_ajuste (
  id_parametro INTEGER PRIMARY KEY DEFAULT 1,
  limite_cantidad NUMERIC(12,2) NOT NULL DEFAULT 50,
  limite_monto NUMERIC(14,2) NOT NULL DEFAULT 1000,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario_actualiza INTEGER REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_param_ajuste_unico CHECK (id_parametro = 1),
  CONSTRAINT chk_param_ajuste_cantidad CHECK (limite_cantidad > 0),
  CONSTRAINT chk_param_ajuste_monto CHECK (limite_monto > 0)
);

INSERT INTO parametros_aprobacion_ajuste (id_parametro)
VALUES (1)
ON CONFLICT (id_parametro) DO NOTHING;

-- Al registrar: un ajuste PENDIENTE todavía no tiene aprobador; los demás sí.
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

  IF NEW.id_usuario IS NULL THEN
    RAISE EXCEPTION 'El ajuste debe quedar asociado al usuario que lo registra';
  END IF;

  IF NEW.estado = 'PENDIENTE' THEN
    NEW.id_usuario_aprueba := NULL;
    NEW.fecha_aprobacion := NULL;
  ELSIF NEW.estado = 'APLICADO' THEN
    IF NEW.id_usuario_aprueba IS NULL THEN
      RAISE EXCEPTION 'El ajuste debe quedar asociado al usuario que lo aprueba';
    END IF;
  ELSE
    RAISE EXCEPTION 'Un ajuste nuevo solo puede registrarse como APLICADO o PENDIENTE';
  END IF;

  IF NEW.fecha_ajuste IS NULL THEN
    NEW.fecha_ajuste := CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;

-- La justificación sigue siendo inmutable. La única modificación permitida es
-- decidir un ajuste PENDIENTE (aprobarlo o rechazarlo), por un usuario distinto
-- al que lo registró.
CREATE OR REPLACE FUNCTION impedir_cambio_ajuste()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado = 'PENDIENTE'
     AND NEW.estado IN ('APROBADO', 'RECHAZADO')
     AND NEW.numero_ajuste IS NOT DISTINCT FROM OLD.numero_ajuste
     AND NEW.id_almacen IS NOT DISTINCT FROM OLD.id_almacen
     AND NEW.id_producto IS NOT DISTINCT FROM OLD.id_producto
     AND NEW.id_lote IS NOT DISTINCT FROM OLD.id_lote
     AND NEW.id_usuario IS NOT DISTINCT FROM OLD.id_usuario
     AND NEW.cantidad_anterior IS NOT DISTINCT FROM OLD.cantidad_anterior
     AND NEW.cantidad_nueva IS NOT DISTINCT FROM OLD.cantidad_nueva
     AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
     AND NEW.comentario IS NOT DISTINCT FROM OLD.comentario
     AND NEW.fecha_ajuste IS NOT DISTINCT FROM OLD.fecha_ajuste
     AND NEW.requiere_aprobacion IS NOT DISTINCT FROM OLD.requiere_aprobacion
     AND NEW.valor_ajuste IS NOT DISTINCT FROM OLD.valor_ajuste
  THEN
    IF NEW.id_usuario_aprueba IS NULL THEN
      RAISE EXCEPTION 'La decisión del ajuste debe registrar el usuario que la toma';
    END IF;
    IF NEW.id_usuario_aprueba = OLD.id_usuario THEN
      RAISE EXCEPTION 'Quien registró el ajuste no puede aprobarlo ni rechazarlo';
    END IF;
    NEW.fecha_aprobacion := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Una justificación de ajuste registrada no puede modificarse ni eliminarse';
END;
$$;
