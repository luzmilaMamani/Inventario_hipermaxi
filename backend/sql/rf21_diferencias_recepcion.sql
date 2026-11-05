-- RF21: diferencias de una recepción (faltante, sobrante o dañado).
-- La nota se guarda en "observacion". Si la tabla ya existía con "observaciones", se copia.

CREATE TABLE IF NOT EXISTS diferencias_recepcion (
  id_diferencia SERIAL PRIMARY KEY,
  id_entrada INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  cantidad NUMERIC(14, 3) NOT NULL,
  observacion VARCHAR(500),
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INTEGER NOT NULL
);

ALTER TABLE diferencias_recepcion
  ADD COLUMN IF NOT EXISTS observacion VARCHAR(500);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'diferencias_recepcion'
      AND column_name = 'observaciones'
  ) THEN
    UPDATE diferencias_recepcion
    SET observacion = LEFT(observaciones, 500)
    WHERE observacion IS NULL
      AND observaciones IS NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dif_entrada') THEN
    ALTER TABLE diferencias_recepcion
      ADD CONSTRAINT fk_dif_entrada
      FOREIGN KEY (id_entrada) REFERENCES entradas_inventario(id_entrada) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dif_producto') THEN
    ALTER TABLE diferencias_recepcion
      ADD CONSTRAINT fk_dif_producto
      FOREIGN KEY (id_producto) REFERENCES productos(id_producto);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dif_usuario') THEN
    ALTER TABLE diferencias_recepcion
      ADD CONSTRAINT fk_dif_usuario
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dif_tipo') THEN
    ALTER TABLE diferencias_recepcion
      ADD CONSTRAINT chk_dif_tipo
      CHECK (tipo IN ('FALTANTE', 'SOBRANTE', 'DANADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dif_cantidad') THEN
    ALTER TABLE diferencias_recepcion
      ADD CONSTRAINT chk_dif_cantidad
      CHECK (cantidad > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diferencias_recepcion_entrada
  ON diferencias_recepcion (id_entrada);
