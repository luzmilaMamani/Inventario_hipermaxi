-- Metas de cada KPI (globales o por sucursal) y la foto mensual del valor.
-- id_almacen NULL es la meta o la foto de todas las sucursales juntas.

CREATE TABLE IF NOT EXISTS kpi_meta (
  id_meta SERIAL PRIMARY KEY,
  codigo_kpi VARCHAR(40) NOT NULL,
  id_almacen INTEGER REFERENCES almacenes (id_almacen),
  meta NUMERIC(14, 4) NOT NULL CHECK (meta >= 0),
  id_usuario INTEGER REFERENCES usuarios (id_usuario),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_meta_global
  ON kpi_meta (codigo_kpi) WHERE id_almacen IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_meta_sucursal
  ON kpi_meta (codigo_kpi, id_almacen) WHERE id_almacen IS NOT NULL;

CREATE TABLE IF NOT EXISTS kpi_snapshot (
  id_snapshot BIGSERIAL PRIMARY KEY,
  anio SMALLINT NOT NULL,
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  id_almacen INTEGER REFERENCES almacenes (id_almacen),
  codigo_kpi VARCHAR(40) NOT NULL,
  valor NUMERIC(14, 4),
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_snapshot_global
  ON kpi_snapshot (codigo_kpi, anio, mes) WHERE id_almacen IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_snapshot_sucursal
  ON kpi_snapshot (codigo_kpi, id_almacen, anio, mes) WHERE id_almacen IS NOT NULL;

-- Metas iniciales de toda la empresa. El gerente puede cambiarlas.
INSERT INTO kpi_meta (codigo_kpi, id_almacen, meta)
SELECT v.codigo, NULL, v.meta
FROM (VALUES
  ('VALOR_INVENTARIO', 500000),
  ('ROTACION', 1),
  ('QUIEBRE_STOCK', 5),
  ('MERMA', 2),
  ('EXACTITUD', 95),
  ('VALOR_RIESGO_VENCIMIENTO', 10000),
  ('CUMPLIMIENTO_PROVEEDORES', 95)
) AS v(codigo, meta)
WHERE NOT EXISTS (
  SELECT 1 FROM kpi_meta m
  WHERE m.codigo_kpi = v.codigo AND m.id_almacen IS NULL
);
