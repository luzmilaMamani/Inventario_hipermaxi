-- RF71 (HIP-244): valorización del inventario por almacén (sucursal) y
-- categoría. Usa el mismo valor unitario que el resto de reportes valorizados
-- (productos.precio), porque las recepciones no registran costo de compra.
-- Separa lo disponible de lo reservado y de lo que no se puede vender
-- (vencido o en cuarentena).

CREATE OR REPLACE VIEW vw_valorizacion_inventario AS
SELECT
  e.id_almacen,
  e.almacen_codigo,
  e.almacen,
  e.tipo_almacen,
  COALESCE(NULLIF(BTRIM(e.ciudad), ''), 'Sin ciudad') AS ciudad,
  e.id_categoria,
  e.categoria,
  COUNT(DISTINCT e.id_producto)::int AS productos,
  SUM(e.cantidad_total) AS unidades,
  SUM(e.valor_total)::numeric(14, 2) AS valor_total,
  SUM(e.cantidad_disponible * e.precio_unitario)::numeric(14, 2) AS valor_disponible,
  SUM(e.cantidad_reservada * e.precio_unitario)::numeric(14, 2) AS valor_reservado,
  SUM((e.cantidad_vencida + e.cantidad_cuarentena) * e.precio_unitario)::numeric(14, 2) AS valor_no_disponible
FROM vw_reporte_existencias e
WHERE e.cantidad_total > 0
GROUP BY e.id_almacen, e.almacen_codigo, e.almacen, e.tipo_almacen, e.ciudad,
         e.id_categoria, e.categoria;
