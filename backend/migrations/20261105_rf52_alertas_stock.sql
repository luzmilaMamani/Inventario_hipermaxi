CREATE TABLE IF NOT EXISTS alertas_stock (
  id_alerta SERIAL PRIMARY KEY,
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  id_almacen INTEGER NOT NULL REFERENCES almacenes(id_almacen),
  tipo VARCHAR(30) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
  fecha_alerta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TIMESTAMP,
  cantidad_actual NUMERIC NOT NULL,
  stock_minimo NUMERIC NOT NULL,
  punto_reposicion NUMERIC NOT NULL,
  CONSTRAINT chk_alertas_stock_tipo CHECK (tipo IN ('PUNTO_REPOSICION', 'STOCK_MINIMO')),
  CONSTRAINT chk_alertas_stock_estado CHECK (estado IN ('ABIERTA', 'CERRADA'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_stock_abiertas
  ON alertas_stock (id_producto, id_almacen, tipo)
  WHERE estado = 'ABIERTA';

CREATE INDEX IF NOT EXISTS idx_alertas_stock_fecha
  ON alertas_stock (fecha_alerta DESC);

CREATE OR REPLACE FUNCTION fn_aplicar_alertas_stock(
  p_producto INTEGER,
  p_almacen INTEGER,
  p_cantidad NUMERIC,
  p_minimo NUMERIC,
  p_reposicion NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_minimo NUMERIC := COALESCE(p_minimo, 0);
  v_reposicion NUMERIC := COALESCE(p_reposicion, 0);
  v_tipo TEXT;
  v_umbral NUMERIC;
BEGIN
  FOREACH v_tipo IN ARRAY ARRAY['PUNTO_REPOSICION', 'STOCK_MINIMO']
  LOOP
    v_umbral := CASE WHEN v_tipo = 'PUNTO_REPOSICION' THEN v_reposicion ELSE v_minimo END;

    IF v_umbral > 0 AND p_cantidad <= v_umbral THEN
      INSERT INTO alertas_stock (
        id_producto, id_almacen, tipo, estado, cantidad_actual, stock_minimo, punto_reposicion
      )
      VALUES (
        p_producto, p_almacen, v_tipo, 'ABIERTA', p_cantidad, v_minimo, v_reposicion
      )
      ON CONFLICT (id_producto, id_almacen, tipo) WHERE estado = 'ABIERTA'
      DO NOTHING;
    ELSE
      UPDATE alertas_stock
      SET estado = 'CERRADA',
          fecha_cierre = CURRENT_TIMESTAMP
      WHERE id_producto = p_producto
        AND id_almacen = p_almacen
        AND tipo = v_tipo
        AND estado = 'ABIERTA';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_alertas_stock_tras_movimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_minimo NUMERIC;
  v_reposicion NUMERIC;
BEGIN
  SELECT stock_minimo, punto_reposicion
    INTO v_minimo, v_reposicion
  FROM productos
  WHERE id_producto = NEW.id_producto;

  PERFORM fn_aplicar_alertas_stock(
    NEW.id_producto,
    NEW.id_almacen,
    NEW.cantidad,
    v_minimo,
    v_reposicion
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alertas_stock ON stock;
CREATE TRIGGER trg_alertas_stock
  AFTER INSERT OR UPDATE OF cantidad ON stock
  FOR EACH ROW
  EXECUTE FUNCTION fn_alertas_stock_tras_movimiento();

CREATE OR REPLACE FUNCTION fn_alertas_stock_tras_umbral()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  fila RECORD;
BEGIN
  IF NEW.stock_minimo IS NOT DISTINCT FROM OLD.stock_minimo
     AND NEW.punto_reposicion IS NOT DISTINCT FROM OLD.punto_reposicion THEN
    RETURN NEW;
  END IF;

  FOR fila IN
    SELECT id_almacen, cantidad
    FROM stock
    WHERE id_producto = NEW.id_producto
  LOOP
    PERFORM fn_aplicar_alertas_stock(
      NEW.id_producto,
      fila.id_almacen,
      fila.cantidad,
      NEW.stock_minimo,
      NEW.punto_reposicion
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alertas_stock_umbral ON productos;
CREATE TRIGGER trg_alertas_stock_umbral
  AFTER UPDATE OF stock_minimo, punto_reposicion ON productos
  FOR EACH ROW
  EXECUTE FUNCTION fn_alertas_stock_tras_umbral();

DO $$
DECLARE
  fila RECORD;
BEGIN
  FOR fila IN
    SELECT s.id_producto, s.id_almacen, s.cantidad, p.stock_minimo, p.punto_reposicion
    FROM stock s
    INNER JOIN productos p ON p.id_producto = s.id_producto
  LOOP
    PERFORM fn_aplicar_alertas_stock(
      fila.id_producto,
      fila.id_almacen,
      fila.cantidad,
      fila.stock_minimo,
      fila.punto_reposicion
    );
  END LOOP;
END;
$$;
