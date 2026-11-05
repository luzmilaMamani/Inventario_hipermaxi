-- RF40: fecha de vencimiento obligatoria en los lotes de productos que la controlan.
-- La tabla lotes_productos ya asocia producto, almacén, número de lote,
-- fecha de vencimiento y cantidad; aquí se agregan las reglas de integridad.

-- El vencimiento no puede ser anterior al ingreso del lote.
-- NOT VALID: no se revalidan lotes históricos, solo inserciones/cambios nuevos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.lotes_productos'::regclass
      AND conname = 'chk_lotes_vencimiento_posterior_ingreso'
  ) THEN
    ALTER TABLE lotes_productos
      ADD CONSTRAINT chk_lotes_vencimiento_posterior_ingreso
      CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_ingreso::date)
      NOT VALID;
  END IF;
END;
$$;

-- Un lote nuevo de un producto con controla_vencimiento debe traer su fecha.
CREATE OR REPLACE FUNCTION fn_lotes_exigir_vencimiento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_vencimiento IS NULL AND EXISTS (
    SELECT 1
    FROM productos
    WHERE id_producto = NEW.id_producto
      AND controla_vencimiento = TRUE
  ) THEN
    RAISE EXCEPTION 'El producto % controla vencimiento: el lote requiere fecha de vencimiento',
      NEW.id_producto
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lotes_exigir_vencimiento ON lotes_productos;

CREATE TRIGGER trg_lotes_exigir_vencimiento
BEFORE INSERT ON lotes_productos
FOR EACH ROW
EXECUTE FUNCTION fn_lotes_exigir_vencimiento();

-- Consultas de lotes por producto/almacén ordenadas por vencimiento (FEFO, reportes).
CREATE INDEX IF NOT EXISTS idx_lotes_producto_almacen_vencimiento
  ON lotes_productos (id_producto, id_almacen, fecha_vencimiento);
