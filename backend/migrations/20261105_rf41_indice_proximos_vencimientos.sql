-- RF41: consulta de lotes próximos a vencer.
-- La consulta filtra lotes con existencia por rango de fecha de vencimiento
-- y los ordena del vencimiento más cercano al más lejano.

-- Índice parcial por fecha de vencimiento: solo lotes con fecha y cantidad.
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento_con_stock
  ON lotes_productos (fecha_vencimiento, id_almacen)
  WHERE fecha_vencimiento IS NOT NULL AND cantidad_actual > 0;
