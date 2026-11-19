-- RF62 (HIP-221): vistas base de los indicadores del inventario.

-- Movimientos con su efecto sobre el stock (+ entra, - sale) y valorizados con
-- el precio del producto. TRANSFERENCIA y AJUSTE pueden sumar o restar: se usa
-- el saldo anterior y nuevo que cada movimiento registra.
CREATE OR REPLACE VIEW vw_movimientos_valorizados AS
SELECT
  m.id_movimiento,
  m.fecha_movimiento,
  m.id_producto,
  m.id_almacen,
  m.id_lote,
  m.id_usuario,
  m.tipo_movimiento,
  m.cantidad,
  m.referencia,
  m.observaciones,
  sg.signo,
  sg.signo * m.cantidad AS cantidad_neta,
  COALESCE(p.precio, 0) AS precio_unitario,
  (m.cantidad * COALESCE(p.precio, 0))::numeric(14, 2) AS valor,
  -- Venta: el registro directo de ventas (VENTA) o una salida con motivo VENTA.
  (m.tipo_movimiento = 'VENTA'
    OR (m.tipo_movimiento = 'SALIDA' AND s.motivo = 'VENTA')) AS es_venta,
  (m.tipo_movimiento IN ('SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO')) AS es_merma
FROM movimientos_inventario m
INNER JOIN productos p ON p.id_producto = m.id_producto
LEFT JOIN salidas_inventario s
  ON m.tipo_movimiento = 'SALIDA' AND s.numero_salida = m.referencia
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION') THEN 1
    WHEN m.tipo_movimiento IN ('SALIDA', 'VENTA', 'SALIDA_PERDIDA', 'SALIDA_DANO',
                               'SALIDA_VENCIMIENTO', 'DEVOLUCION_PROVEEDOR') THEN -1
    WHEN m.stock_nuevo IS NOT NULL AND m.stock_anterior IS NOT NULL
      THEN SIGN(m.stock_nuevo - m.stock_anterior)::int
    ELSE 0
  END AS signo
) sg;

-- Una fila por recepción de proveedor con cuántas líneas llegaron con diferencia
-- (RF20/RF21). Sirve para el cumplimiento de proveedores.
CREATE OR REPLACE VIEW vw_recepciones_cumplimiento AS
SELECT
  e.id_entrada,
  e.numero_entrada,
  e.id_almacen,
  e.fecha_entrada,
  COALESCE(NULLIF(BTRIM(e.origen), ''), 'Sin proveedor') AS proveedor,
  e.estado,
  COUNT(de.id_detalle_entrada)::int AS lineas,
  COUNT(de.id_detalle_entrada) FILTER (WHERE COALESCE(de.diferencia, 0) <> 0)::int AS lineas_con_diferencia,
  COALESCE(SUM(de.cantidad_solicitada), 0) AS cantidad_solicitada,
  COALESCE(SUM(de.cantidad_recibida), 0) AS cantidad_recibida,
  COUNT(de.id_detalle_entrada) FILTER (WHERE COALESCE(de.diferencia, 0) <> 0) = 0 AS sin_diferencia
FROM entradas_inventario e
LEFT JOIN detalle_entradas de ON de.id_entrada = e.id_entrada
WHERE e.estado IN ('RECIBIDA', 'CONFIRMADA')
GROUP BY e.id_entrada;

-- Líneas contadas en inventarios físicos finalizados (exactitud del inventario).
CREATE OR REPLACE VIEW vw_conteos_inventario AS
SELECT
  d.id_detalle,
  i.id_inventario,
  i.numero_inventario,
  i.id_almacen,
  COALESCE(i.fecha_fin, i.fecha_inicio, i.fecha_programada::timestamp) AS fecha_conteo,
  d.id_producto,
  d.cantidad_sistema,
  d.cantidad_fisica,
  COALESCE(d.diferencia, d.cantidad_fisica - d.cantidad_sistema) AS diferencia,
  COALESCE(d.diferencia, d.cantidad_fisica - d.cantidad_sistema) = 0 AS sin_diferencia
FROM detalle_inventario_fisico d
INNER JOIN inventarios_fisicos i ON i.id_inventario = d.id_inventario
WHERE i.estado = 'FINALIZADO';

-- Los indicadores filtran movimientos por almacén y período.
CREATE INDEX IF NOT EXISTS idx_movimientos_almacen_fecha
  ON movimientos_inventario (id_almacen, fecha_movimiento);
CREATE INDEX IF NOT EXISTS idx_entradas_fecha ON entradas_inventario (fecha_entrada);
