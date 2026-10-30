-- Bandeja de salida (outbox) para publicar alertas de stock bajo en Google Pub/Sub.
-- El trigger registra un evento cada vez que un movimiento deja el stock de un
-- producto en un almacén por debajo del stock mínimo o del punto de reposición.
-- El backend escucha el canal 'stock_bajo' y publica los eventos pendientes.

CREATE TABLE IF NOT EXISTS eventos_stock_bajo (
  id_evento BIGSERIAL PRIMARY KEY,
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  id_almacen INTEGER NOT NULL REFERENCES almacenes(id_almacen),
  cantidad_anterior NUMERIC,
  cantidad_actual NUMERIC NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PUBLICADO', 'ERROR')),
  intentos INTEGER NOT NULL DEFAULT 0,
  message_id VARCHAR(100),
  ultimo_error TEXT,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_publicacion TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_stock_bajo_pendientes
  ON eventos_stock_bajo (id_evento)
  WHERE estado <> 'PUBLICADO';

CREATE OR REPLACE FUNCTION fn_registrar_evento_stock_bajo()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_minimo NUMERIC;
  v_punto_reposicion NUMERIC;
  v_id_evento BIGINT;
BEGIN
  -- Solo interesa cuando el stock baja (o se crea el registro)
  IF TG_OP = 'UPDATE' AND NEW.cantidad >= OLD.cantidad THEN
    RETURN NEW;
  END IF;

  SELECT stock_minimo, punto_reposicion
    INTO v_stock_minimo, v_punto_reposicion
  FROM productos
  WHERE id_producto = NEW.id_producto;

  IF NEW.cantidad <= NULLIF(v_punto_reposicion, 0)
     OR NEW.cantidad <= v_stock_minimo THEN
    INSERT INTO eventos_stock_bajo (id_producto, id_almacen, cantidad_anterior, cantidad_actual)
    VALUES (
      NEW.id_producto,
      NEW.id_almacen,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.cantidad END,
      NEW.cantidad
    )
    RETURNING id_evento INTO v_id_evento;

    -- NOTIFY se entrega solo si la transacción hace COMMIT
    PERFORM pg_notify('stock_bajo', v_id_evento::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_bajo ON stock;

CREATE TRIGGER trg_stock_bajo
AFTER INSERT OR UPDATE OF cantidad ON stock
FOR EACH ROW
EXECUTE FUNCTION fn_registrar_evento_stock_bajo();
