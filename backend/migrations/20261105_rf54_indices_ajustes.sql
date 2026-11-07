CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_fecha
  ON ajustes_inventario (fecha_ajuste DESC);

CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_almacen
  ON ajustes_inventario (id_almacen);

CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_producto
  ON ajustes_inventario (id_producto);
