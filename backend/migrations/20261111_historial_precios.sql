CREATE TABLE IF NOT EXISTS historial_precios (
  id_historial SERIAL PRIMARY KEY,
  id_producto INTEGER NOT NULL REFERENCES productos (id_producto),
  precio_anterior NUMERIC(12, 2),
  precio_nuevo NUMERIC(12, 2) NOT NULL,
  id_usuario INTEGER REFERENCES usuarios (id_usuario),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_historial_precio_nuevo CHECK (precio_nuevo >= 0),
  CONSTRAINT chk_historial_precio_anterior CHECK (precio_anterior IS NULL OR precio_anterior >= 0)
);

CREATE INDEX IF NOT EXISTS idx_historial_precios_producto
  ON historial_precios (id_producto, fecha DESC, id_historial DESC);

INSERT INTO historial_precios (id_producto, precio_anterior, precio_nuevo, fecha)
SELECT p.id_producto, NULL, p.precio, p.fecha_creacion
FROM productos p
WHERE NOT EXISTS (
  SELECT 1 FROM historial_precios h WHERE h.id_producto = p.id_producto
);
