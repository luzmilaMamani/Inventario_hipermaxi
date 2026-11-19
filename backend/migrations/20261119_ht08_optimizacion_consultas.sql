-- HT08 (HIP-256): optimizaciones detectadas en las pruebas de rendimiento con
-- 3.000 productos, 20 almacenes, 120.000 lotes y 600.000 movimientos.
-- Resultados y mediciones: docs/pruebas/rendimiento_sprint4.md

-- 1. Existencias: lo vencido y lo que está en cuarentena se calculaba con dos
--    funciones por cada fila de stock (2 × 60.000 subconsultas). Se reemplaza
--    por una sola agregación de lotes, con el mismo criterio de RF43/RF61.
--    1.318 ms → ~200 ms. La usan existencias, valorización, comparativo e
--    indicadores.
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
  COALESCE(nd.cantidad_vencida, 0) AS cantidad_vencida,
  COALESCE(nd.cantidad_cuarentena, 0) AS cantidad_cuarentena,
  GREATEST(
    s.cantidad - COALESCE(s.cantidad_reservada, 0)
      - COALESCE(nd.cantidad_vencida, 0) - COALESCE(nd.cantidad_cuarentena, 0),
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
LEFT JOIN (
  SELECT
    lp.id_producto,
    lp.id_almacen,
    -- Igual que fn_cantidad_vencida: VENCIDO, o vigente cuya fecha ya pasó (incluye hoy).
    SUM(lp.cantidad_actual) FILTER (
      WHERE lp.estado = 'VENCIDO'
         OR (lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
             AND lp.fecha_vencimiento IS NOT NULL
             AND lp.fecha_vencimiento <= CURRENT_DATE)
    ) AS cantidad_vencida,
    -- Igual que fn_cantidad_cuarentena.
    SUM(lp.cantidad_actual) FILTER (WHERE lp.estado = 'CUARENTENA') AS cantidad_cuarentena
  FROM lotes_productos lp
  WHERE lp.cantidad_actual > 0
  GROUP BY lp.id_producto, lp.id_almacen
) nd ON nd.id_producto = s.id_producto AND nd.id_almacen = s.id_almacen;

-- 2. Cumplimiento de proveedores: el detalle de cada recepción se buscaba sin
--    índice (una lectura completa de detalle_entradas por recepción).
CREATE INDEX IF NOT EXISTS idx_detalle_entradas_entrada ON detalle_entradas (id_entrada);

-- 3. El detalle de las salidas se une por id_salida en pérdidas, kardex y salidas.
CREATE INDEX IF NOT EXISTS idx_detalle_salidas_salida ON detalle_salidas (id_salida);
