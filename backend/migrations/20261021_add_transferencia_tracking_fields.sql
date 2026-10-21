ALTER TABLE transferencias
  ADD COLUMN IF NOT EXISTS fecha_llegada_estimada DATE,
  ADD COLUMN IF NOT EXISTS fecha_rechazo TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fecha_cancelacion TIMESTAMP;
