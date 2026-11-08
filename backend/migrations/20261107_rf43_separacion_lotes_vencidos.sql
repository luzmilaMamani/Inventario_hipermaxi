-- RF43: los lotes vencidos se separan del stock disponible.
-- Un lote con fecha de vencimiento igual o anterior a hoy pasa a estado
-- VENCIDO (mismo criterio que FEFO, RF49, y alertas, RF42). Su cantidad sigue
-- en el stock físico hasta registrar la salida por VENCIMIENTO (RF27), pero
-- deja de contarse como disponible y no puede usarse en ventas ni transferencias.

-- Marca como VENCIDO los lotes vigentes cuya fecha ya pasó.
-- Devuelve la cantidad de lotes marcados.
CREATE OR REPLACE FUNCTION fn_marcar_lotes_vencidos()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_marcados INTEGER;
BEGIN
  UPDATE lotes_productos
  SET estado = 'VENCIDO'
  WHERE fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento <= CURRENT_DATE
    AND estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER');
  GET DIAGNOSTICS v_marcados = ROW_COUNT;
  RETURN v_marcados;
END;
$$;

-- Un lote que se registra o se modifica con una fecha ya vencida queda VENCIDO.
CREATE OR REPLACE FUNCTION fn_lotes_estado_vencido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fecha_vencimiento IS NOT NULL
     AND NEW.fecha_vencimiento <= CURRENT_DATE
     AND NEW.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER') THEN
    NEW.estado := 'VENCIDO';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotes_estado_vencido ON lotes_productos;
CREATE TRIGGER trg_lotes_estado_vencido
BEFORE INSERT OR UPDATE OF fecha_vencimiento, estado ON lotes_productos
FOR EACH ROW
EXECUTE FUNCTION fn_lotes_estado_vencido();

-- Cantidad vencida (aún sin dar de baja) de un producto en un almacén.
-- Considera también los lotes cuya fecha pasó y que el proceso programado
-- todavía no marcó.
CREATE OR REPLACE FUNCTION fn_cantidad_vencida(p_id_producto INTEGER, p_id_almacen INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(lp.cantidad_actual), 0)
  FROM lotes_productos lp
  WHERE lp.id_producto = p_id_producto
    AND lp.id_almacen = p_id_almacen
    AND lp.cantidad_actual > 0
    AND (
      lp.estado = 'VENCIDO'
      OR (
        lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
        AND lp.fecha_vencimiento IS NOT NULL
        AND lp.fecha_vencimiento <= CURRENT_DATE
      )
    );
$$;

-- Disponibilidad por producto y almacén descartando lo reservado y lo vencido.
CREATE OR REPLACE VIEW vw_stock_disponible AS
SELECT
  s.id_stock,
  s.id_producto,
  s.id_almacen,
  s.cantidad,
  COALESCE(s.cantidad_reservada, 0) AS cantidad_reservada,
  fn_cantidad_vencida(s.id_producto, s.id_almacen) AS cantidad_vencida,
  GREATEST(
    s.cantidad - COALESCE(s.cantidad_reservada, 0)
      - fn_cantidad_vencida(s.id_producto, s.id_almacen),
    0
  ) AS cantidad_disponible
FROM stock s;

-- Consulta de la vista de vencidos por almacén.
CREATE INDEX IF NOT EXISTS idx_lotes_vencidos_almacen
  ON lotes_productos (id_almacen, fecha_vencimiento)
  WHERE cantidad_actual > 0 AND estado = 'VENCIDO';

SELECT fn_marcar_lotes_vencidos();
