-- RF65 (HIP-229): stock histórico y salidas por producto en un período, base del
-- índice de rotación.
--
-- El stock de una fecha pasada se reconstruye desde el stock actual restando
-- lo que se movió después. El stock promedio del período [a, b) es exacto (área
-- bajo la curva del stock), sin recorrer día por día:
--   promedio = stock(b) - Σ neto_m · (t_m - a) / (b - a)   para cada movimiento m en [a, b)
--
-- Salidas para rotación: consumo real (ventas y despachos: SALIDA, VENTA) menos
-- ventas anuladas. No cuentan transferencias, ajustes ni mermas.

CREATE OR REPLACE FUNCTION fn_rotacion_productos(
  p_desde DATE,
  p_hasta DATE,
  p_almacen INTEGER DEFAULT NULL,
  p_categoria INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id_producto INTEGER,
  codigo VARCHAR,
  producto VARCHAR,
  id_categoria INTEGER,
  categoria VARCHAR,
  unidad VARCHAR,
  precio NUMERIC,
  stock_inicial NUMERIC,
  stock_final NUMERIC,
  stock_promedio NUMERIC,
  unidades_salida NUMERIC,
  valor_salida NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH periodo AS (
    SELECT p_desde::timestamp AS a,
           (p_hasta + 1)::timestamp AS b,
           EXTRACT(EPOCH FROM ((p_hasta + 1)::timestamp - p_desde::timestamp)) AS segundos
  ),
  actual AS (
    SELECT s.id_producto, SUM(s.cantidad) AS cantidad
    FROM stock s
    WHERE p_almacen IS NULL OR s.id_almacen = p_almacen
    GROUP BY s.id_producto
  ),
  movs AS (
    SELECT
      mv.id_producto,
      COALESCE(SUM(mv.cantidad_neta) FILTER (WHERE mv.fecha_movimiento >= pe.b), 0) AS neto_posterior,
      COALESCE(SUM(mv.cantidad_neta) FILTER (WHERE mv.fecha_movimiento < pe.b), 0) AS neto_periodo,
      COALESCE(SUM(mv.cantidad_neta * EXTRACT(EPOCH FROM (mv.fecha_movimiento - pe.a)))
               FILTER (WHERE mv.fecha_movimiento < pe.b), 0) AS neto_ponderado,
      COALESCE(SUM(CASE
        WHEN mv.tipo_movimiento IN ('SALIDA', 'VENTA') THEN mv.cantidad
        WHEN mv.tipo_movimiento = 'ANULACION_VENTA' THEN -mv.cantidad
        ELSE 0
      END) FILTER (WHERE mv.fecha_movimiento < pe.b), 0) AS unidades_salida
    FROM vw_movimientos_valorizados mv
    CROSS JOIN periodo pe
    WHERE mv.fecha_movimiento >= pe.a
      AND (p_almacen IS NULL OR mv.id_almacen = p_almacen)
    GROUP BY mv.id_producto
  )
  SELECT
    p.id_producto,
    p.codigo,
    p.nombre,
    c.id_categoria,
    c.nombre,
    um.abreviatura,
    COALESCE(p.precio, 0),
    GREATEST(COALESCE(ac.cantidad, 0) - COALESCE(mo.neto_posterior, 0) - COALESCE(mo.neto_periodo, 0), 0),
    GREATEST(COALESCE(ac.cantidad, 0) - COALESCE(mo.neto_posterior, 0), 0),
    GREATEST(
      COALESCE(ac.cantidad, 0) - COALESCE(mo.neto_posterior, 0)
        - COALESCE(mo.neto_ponderado, 0) / NULLIF(pe.segundos, 0),
      0
    )::numeric(14, 2),
    GREATEST(COALESCE(mo.unidades_salida, 0), 0),
    (GREATEST(COALESCE(mo.unidades_salida, 0), 0) * COALESCE(p.precio, 0))::numeric(14, 2)
  FROM productos p
  INNER JOIN categorias c ON c.id_categoria = p.id_categoria
  INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
  CROSS JOIN periodo pe
  LEFT JOIN actual ac ON ac.id_producto = p.id_producto
  LEFT JOIN movs mo ON mo.id_producto = p.id_producto
  WHERE p.estado = 'ACTIVO'
    AND (p_categoria IS NULL OR p.id_categoria = p_categoria)
$$;
