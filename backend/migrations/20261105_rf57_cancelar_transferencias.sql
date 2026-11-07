-- RF57: cancelación de solicitudes de transferencia no enviadas.
-- El estado CANCELADA y fecha_cancelacion ya existen; aquí se agrega el
-- registro de motivo y usuario, y la reserva de stock por línea que se
-- libera al cancelar o rechazar.

ALTER TABLE transferencias
  ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT,
  ADD COLUMN IF NOT EXISTS id_usuario_cancela INTEGER REFERENCES usuarios (id_usuario);

-- Cantidad reservada en el almacén de origen por cada línea de la solicitud.
-- Las transferencias anteriores a RF57 quedan en 0: nunca reservaron stock.
ALTER TABLE detalle_transferencias
  ADD COLUMN IF NOT EXISTS cantidad_reservada NUMERIC(12, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.detalle_transferencias'::regclass
      AND conname = 'chk_detalle_transferencias_cantidad_reservada'
  ) THEN
    ALTER TABLE detalle_transferencias
      ADD CONSTRAINT chk_detalle_transferencias_cantidad_reservada
      CHECK (cantidad_reservada >= 0);
  END IF;

  -- Toda cancelación debe registrar motivo, usuario y fecha.
  -- NOT VALID: no se revalidan transferencias históricas.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.transferencias'::regclass
      AND conname = 'chk_transferencias_cancelacion_registrada'
  ) THEN
    ALTER TABLE transferencias
      ADD CONSTRAINT chk_transferencias_cancelacion_registrada
      CHECK (
        estado <> 'CANCELADA'
        OR (
          NULLIF(BTRIM(motivo_cancelacion), '') IS NOT NULL
          AND id_usuario_cancela IS NOT NULL
          AND fecha_cancelacion IS NOT NULL
        )
      )
      NOT VALID;
  END IF;
END;
$$;
