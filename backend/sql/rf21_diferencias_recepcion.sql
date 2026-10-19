-- RF21: diferencias de una recepción (faltante, sobrante o dañado).

CREATE TABLE IF NOT EXISTS diferencias_recepcion (
  id_diferencia SERIAL PRIMARY KEY,
  id_entrada INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  cantidad NUMERIC(14, 3) NOT NULL,
  observacion VARCHAR(500) NOT NULL,
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diferencias_recepcion_entrada
  ON diferencias_recepcion (id_entrada);
