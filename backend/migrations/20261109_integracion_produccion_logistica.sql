-- HIP-259 / HIP-260: integración asíncrona con Producción y Logística.
-- Inventario recibe solicitudes de materiales y productos terminados, y publica
-- el resultado de cada solicitud, los despachos y los cambios de stock.

-- Bandeja de salida: los eventos se guardan en la misma transacción que el
-- cambio de inventario y un proceso aparte los publica en Pub/Sub.
CREATE TABLE IF NOT EXISTS eventos_integracion (
  id_evento BIGSERIAL PRIMARY KEY,
  tipo_evento VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PUBLICADO', 'ERROR')),
  intentos INTEGER NOT NULL DEFAULT 0,
  message_id VARCHAR(100),
  ultimo_error TEXT,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_ultimo_intento TIMESTAMP,
  fecha_publicacion TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_integracion_pendientes
  ON eventos_integracion (id_evento)
  WHERE estado <> 'PUBLICADO';

-- Mensajes recibidos: la clave primaria evita procesar dos veces el mismo mensaje.
CREATE TABLE IF NOT EXISTS mensajes_integracion (
  tipo_mensaje VARCHAR(40) NOT NULL,
  id_mensaje TEXT NOT NULL,
  payload JSONB NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PROCESADO'
    CHECK (estado IN ('PROCESADO', 'INVALIDO')),
  error TEXT,
  fecha_recepcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tipo_mensaje, id_mensaje)
);

CREATE TABLE IF NOT EXISTS solicitudes_materiales (
  id_solicitud SERIAL PRIMARY KEY,
  id_mensaje TEXT NOT NULL UNIQUE,
  orden_produccion VARCHAR(50) NOT NULL,
  id_almacen INTEGER NOT NULL REFERENCES almacenes (id_almacen),
  estado VARCHAR(20) NOT NULL
    CHECK (estado IN ('RESERVADA', 'PARCIAL', 'RECHAZADA', 'DESPACHADA')),
  fecha_recepcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_salida INTEGER REFERENCES salidas_inventario (id_salida),
  id_usuario_despacho INTEGER REFERENCES usuarios (id_usuario),
  fecha_despacho TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_materiales_estado
  ON solicitudes_materiales (estado, fecha_recepcion DESC);

CREATE TABLE IF NOT EXISTS detalle_solicitudes_materiales (
  id_detalle_solicitud SERIAL PRIMARY KEY,
  id_solicitud INTEGER NOT NULL
    REFERENCES solicitudes_materiales (id_solicitud) ON DELETE CASCADE,
  id_producto INTEGER NOT NULL REFERENCES productos (id_producto),
  cantidad_solicitada NUMERIC(12, 2) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_reservada NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  cantidad_despachada NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
  UNIQUE (id_solicitud, id_producto),
  CHECK (cantidad_reservada <= cantidad_solicitada)
);

-- STOCK_ACTUALIZADO automático: solo cuando un producto pasa de no tener
-- disponible a tenerlo, para no publicar un mensaje por cada venta.
CREATE OR REPLACE FUNCTION fn_registrar_stock_disponible()
RETURNS TRIGGER AS $$
DECLARE
  v_vencida NUMERIC;
  v_antes NUMERIC := 0;
  v_ahora NUMERIC;
BEGIN
  -- El ingreso de productos terminados publica su propio evento más detallado.
  IF current_setting('inventario.omitir_stock_actualizado', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_vencida := fn_cantidad_vencida(NEW.id_producto, NEW.id_almacen);
  v_ahora := COALESCE(NEW.cantidad, 0) - COALESCE(NEW.cantidad_reservada, 0) - v_vencida;
  IF TG_OP = 'UPDATE' THEN
    v_antes := COALESCE(OLD.cantidad, 0) - COALESCE(OLD.cantidad_reservada, 0) - v_vencida;
  END IF;

  IF v_antes <= 0 AND v_ahora > 0 THEN
    INSERT INTO eventos_integracion (tipo_evento, payload)
    VALUES (
      'STOCK_ACTUALIZADO',
      jsonb_build_object(
        'motivo', 'DISPONIBILIDAD_RECUPERADA',
        'id_almacen', NEW.id_almacen,
        'productos', jsonb_build_array(
          jsonb_build_object('id_producto', NEW.id_producto, 'cantidad_disponible', v_ahora)
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_disponible ON stock;

CREATE TRIGGER trg_stock_disponible
AFTER INSERT OR UPDATE OF cantidad, cantidad_reservada ON stock
FOR EACH ROW
EXECUTE FUNCTION fn_registrar_stock_disponible();
