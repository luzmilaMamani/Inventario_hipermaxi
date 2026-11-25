-- Inventario publica el stock disponible hacia el SI de Ventas.
-- El evento se inserta en la misma transacción del movimiento. Un publicador
-- aparte lo envía a Pub/Sub. Si el envío falla, la fila sigue en la bandeja.

CREATE TABLE IF NOT EXISTS outbox_evento (
  id_outbox BIGSERIAL PRIMARY KEY,
  id_mensaje VARCHAR(180) NOT NULL UNIQUE,
  tipo_evento VARCHAR(60) NOT NULL DEFAULT 'inventario.stock-actualizado',
  tipo_movimiento VARCHAR(40) NOT NULL,
  id_movimiento VARCHAR(40) NOT NULL,
  id_producto INTEGER NOT NULL,
  id_almacen INTEGER NOT NULL,
  sucursal VARCHAR(50) NOT NULL,
  codigo_producto VARCHAR(50) NOT NULL,
  stock_disponible NUMERIC(14, 4) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'error')),
  intentos INTEGER NOT NULL DEFAULT 0,
  message_id VARCHAR(120),
  ultimo_error TEXT,
  fecha_ultimo_intento TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_evento_pendientes
  ON outbox_evento (id_outbox)
  WHERE estado <> 'enviado';
