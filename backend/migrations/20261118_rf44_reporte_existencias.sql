-- RF44 (HIP-209): existencias valorizadas por producto y almacén.
-- Una fila por registro de stock, con lo reservado, lo vencido y lo que está en
-- cuarentena separados de lo disponible (mismo criterio que la consulta de stock).
-- El valor se calcula con el precio del producto, igual que el resto de reportes
-- valorizados.

CREATE OR REPLACE VIEW vw_reporte_existencias AS
SELECT
  s.id_stock,
  p.id_producto,
  p.codigo AS producto_codigo,
  p.nombre AS producto,
  p.estado AS estado_producto,
  c.id_categoria,
  c.nombre AS categoria,
  m.id_marca,
  m.nombre AS marca,
  um.abreviatura AS unidad,
  a.id_almacen,
  a.codigo AS almacen_codigo,
  a.nombre AS almacen,
  a.tipo AS tipo_almacen,
  a.ciudad,
  s.cantidad AS cantidad_total,
  COALESCE(s.cantidad_reservada, 0) AS cantidad_reservada,
  nd.cantidad_vencida,
  nd.cantidad_cuarentena,
  GREATEST(
    s.cantidad - COALESCE(s.cantidad_reservada, 0) - nd.cantidad_vencida - nd.cantidad_cuarentena,
    0
  ) AS cantidad_disponible,
  p.stock_minimo,
  COALESCE(p.precio, 0) AS precio_unitario,
  (s.cantidad * COALESCE(p.precio, 0))::numeric(14, 2) AS valor_total,
  s.fecha_actualizacion
FROM stock s
INNER JOIN productos p ON p.id_producto = s.id_producto
INNER JOIN categorias c ON c.id_categoria = p.id_categoria
LEFT JOIN marcas m ON m.id_marca = p.id_marca
INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
CROSS JOIN LATERAL (
  SELECT
    fn_cantidad_vencida(s.id_producto, s.id_almacen) AS cantidad_vencida,
    fn_cantidad_cuarentena(s.id_producto, s.id_almacen) AS cantidad_cuarentena
) nd;

-- El filtro por marca no tenía índice (el de categoría ya existe).
CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos (id_marca);
