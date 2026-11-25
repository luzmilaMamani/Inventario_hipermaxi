-- Reporte de productos con stock bajo (RF13 stock mínimo y RF15 punto de reposición).
-- Compara la cantidad disponible (total menos reservado, vencido y en cuarentena)
-- con los dos umbrales del producto.
-- Un umbral en 0 no cuenta: el producto solo entra si al menos uno es mayor que 0
-- y la cantidad disponible es menor o igual a ese umbral.
-- La cantidad sugerida es lo que falta para llegar al stock máximo; si el máximo
-- es 0, hasta el mayor umbral configurado.

CREATE OR REPLACE VIEW vw_reporte_stock_bajo AS
SELECT
  e.id_stock,
  e.id_producto,
  e.producto_codigo,
  e.producto,
  e.estado_producto,
  e.id_categoria,
  e.categoria,
  e.id_marca,
  e.marca,
  e.unidad,
  e.id_almacen,
  e.almacen_codigo,
  e.almacen,
  e.cantidad_disponible,
  p.stock_minimo,
  p.punto_reposicion,
  COALESCE(p.stock_maximo, 0) AS stock_maximo,
  (p.stock_minimo > 0 AND e.cantidad_disponible <= p.stock_minimo) AS bajo_minimo,
  (p.punto_reposicion > 0 AND e.cantidad_disponible <= p.punto_reposicion) AS en_punto_reposicion,
  GREATEST(
    GREATEST(
      COALESCE(p.stock_maximo, 0),
      COALESCE(p.stock_minimo, 0),
      COALESCE(p.punto_reposicion, 0)
    ) - e.cantidad_disponible,
    0
  ) AS cantidad_sugerida
FROM vw_reporte_existencias e
INNER JOIN productos p ON p.id_producto = e.id_producto
WHERE e.estado_producto = 'ACTIVO'
  AND (
    (p.stock_minimo > 0 AND e.cantidad_disponible <= p.stock_minimo)
    OR (p.punto_reposicion > 0 AND e.cantidad_disponible <= p.punto_reposicion)
  );
