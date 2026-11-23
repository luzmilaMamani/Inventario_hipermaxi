-- Kardex valorizado: cada movimiento conserva el costo unitario que tenía el
-- producto en ese momento. Las recepciones no guardan costo de compra, así que
-- el costo es el precio del producto (el mismo valor unitario del resto de
-- reportes). El promedio ponderado se calcula al consultar el kardex.

ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(14, 4);

UPDATE movimientos_inventario m
SET costo_unitario = COALESCE(p.precio, 0)
FROM productos p
WHERE p.id_producto = m.id_producto
  AND m.costo_unitario IS NULL;

UPDATE movimientos_inventario
SET costo_unitario = 0
WHERE costo_unitario IS NULL;

-- Un insert que no trae costo deja el precio vigente del producto.
-- La columna queda nullable: los INSERT actuales no la envían y el trigger la llena.
CREATE OR REPLACE FUNCTION fn_costo_unitario_movimiento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.costo_unitario IS NULL THEN
    SELECT COALESCE(precio, 0)
      INTO NEW.costo_unitario
    FROM productos
    WHERE id_producto = NEW.id_producto;

    IF NEW.costo_unitario IS NULL THEN
      NEW.costo_unitario := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_costo_unitario_movimiento ON movimientos_inventario;
CREATE TRIGGER trg_costo_unitario_movimiento
  BEFORE INSERT ON movimientos_inventario
  FOR EACH ROW
  EXECUTE FUNCTION fn_costo_unitario_movimiento();

-- Movimientos con signo (+ entra, - sale) y costo unitario, listos para el kardex.
CREATE OR REPLACE VIEW vw_kardex_movimientos AS
SELECT
  m.id_movimiento,
  m.fecha_movimiento,
  m.id_producto,
  m.id_almacen,
  m.tipo_movimiento,
  m.cantidad,
  m.costo_unitario,
  m.referencia,
  m.observaciones,
  m.stock_anterior,
  m.stock_nuevo,
  sg.signo,
  (sg.signo * m.cantidad) AS cantidad_neta
FROM movimientos_inventario m
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'ANULACION_VENTA') THEN 1
    WHEN m.tipo_movimiento IN (
      'SALIDA', 'VENTA', 'SALIDA_PERDIDA', 'SALIDA_DANO',
      'SALIDA_VENCIMIENTO', 'DEVOLUCION_PROVEEDOR'
    ) THEN -1
    WHEN m.stock_nuevo IS NOT NULL AND m.stock_anterior IS NOT NULL
      THEN SIGN(m.stock_nuevo - m.stock_anterior)::int
    ELSE 0
  END AS signo
) sg;
