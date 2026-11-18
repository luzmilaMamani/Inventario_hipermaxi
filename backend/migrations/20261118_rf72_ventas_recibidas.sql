-- RF72 (HIP-274): ventas recibidas del SI de Ventas por Pub/Sub y registro de
-- mensajes procesados (idempotencia).
--
-- Mensaje de Ventas: { id_mensaje, tipo_evento, id_venta, sucursal, fecha,
--                      detalle: [{ codigo_producto, cantidad }] }
-- con tipo_evento = venta.confirmada o venta.anulada.

-- 1. Mensajes procesados: se reutiliza mensajes_integracion. Se agrega el
--    sistema de origen, el estado ERROR (falla de negocio que se puede
--    reprocesar, a diferencia de INVALIDO), los tiempos para medir la latencia
--    publicación → procesamiento y el número de intentos.
ALTER TABLE mensajes_integracion
  ADD COLUMN IF NOT EXISTS sistema VARCHAR(30),
  ADD COLUMN IF NOT EXISTS fecha_publicacion TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fecha_procesado TIMESTAMP,
  ADD COLUMN IF NOT EXISTS latencia_ms INTEGER,
  ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 1;

UPDATE mensajes_integracion
SET sistema = 'PRODUCCION_LOGISTICA'
WHERE sistema IS NULL
  AND tipo_mensaje IN ('SOLICITUD_MATERIALES', 'PRODUCTOS_TERMINADOS');

UPDATE mensajes_integracion
SET fecha_procesado = fecha_recepcion
WHERE fecha_procesado IS NULL;

ALTER TABLE mensajes_integracion
  DROP CONSTRAINT IF EXISTS mensajes_integracion_estado_check;
ALTER TABLE mensajes_integracion
  ADD CONSTRAINT mensajes_integracion_estado_check
  CHECK (estado IN ('PROCESADO', 'INVALIDO', 'ERROR'));

ALTER TABLE mensajes_integracion
  ALTER COLUMN fecha_procesado SET DEFAULT CURRENT_TIMESTAMP;

-- La integración con Producción y Logística no indica el sistema: se deduce del
-- tipo de mensaje.
CREATE OR REPLACE FUNCTION fn_mensajes_integracion_sistema()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sistema IS NULL THEN
    NEW.sistema := CASE
      WHEN NEW.tipo_mensaje IN ('SOLICITUD_MATERIALES', 'PRODUCTOS_TERMINADOS') THEN 'PRODUCCION_LOGISTICA'
      WHEN NEW.tipo_mensaje LIKE 'venta.%' THEN 'VENTAS'
      ELSE 'OTRO'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mensajes_integracion_sistema ON mensajes_integracion;
CREATE TRIGGER trg_mensajes_integracion_sistema
  BEFORE INSERT ON mensajes_integracion
  FOR EACH ROW EXECUTE FUNCTION fn_mensajes_integracion_sistema();

-- Un mismo id_mensaje de Ventas nunca se procesa dos veces, sea cual sea su tipo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_integracion_ventas
  ON mensajes_integracion (id_mensaje)
  WHERE sistema = 'VENTAS';

CREATE INDEX IF NOT EXISTS idx_mensajes_integracion_sistema_fecha
  ON mensajes_integracion (sistema, fecha_recepcion);

CREATE INDEX IF NOT EXISTS idx_mensajes_integracion_con_error
  ON mensajes_integracion (fecha_recepcion DESC)
  WHERE estado = 'ERROR';

-- 2. Ventas recibidas.
CREATE TABLE IF NOT EXISTS venta_recibida (
  id_venta_recibida SERIAL PRIMARY KEY,
  id_venta VARCHAR(60) NOT NULL UNIQUE,
  -- Como llegó en el mensaje (código o id de la sucursal) y el almacén resuelto.
  sucursal VARCHAR(60) NOT NULL,
  id_almacen INTEGER REFERENCES almacenes (id_almacen),
  fecha_venta TIMESTAMP NOT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',
  id_mensaje_confirmacion TEXT,
  id_mensaje_anulacion TEXT,
  fecha_recepcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_descuento TIMESTAMP,
  fecha_anulacion TIMESTAMP,
  error TEXT,
  CONSTRAINT chk_venta_recibida_estado CHECK (
    estado IN ('PENDIENTE', 'DESCONTADA', 'ANULADA', 'ERROR')
  ),
  CONSTRAINT chk_venta_recibida_error CHECK (estado <> 'ERROR' OR error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_venta_recibida_almacen_fecha
  ON venta_recibida (id_almacen, fecha_venta);

CREATE TABLE IF NOT EXISTS venta_recibida_detalle (
  id_venta_recibida_detalle SERIAL PRIMARY KEY,
  id_venta_recibida INTEGER NOT NULL
    REFERENCES venta_recibida (id_venta_recibida) ON DELETE CASCADE,
  codigo_producto VARCHAR(50) NOT NULL,
  id_producto INTEGER REFERENCES productos (id_producto),
  cantidad NUMERIC(12, 2) NOT NULL,
  CONSTRAINT chk_venta_detalle_cantidad CHECK (cantidad > 0 AND cantidad = trunc(cantidad)),
  CONSTRAINT uq_venta_detalle_producto UNIQUE (id_venta_recibida, codigo_producto)
);

-- 3. El reingreso por venta anulada es un movimiento propio, para distinguirlo
--    de una devolución de cliente.
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_tipo_movimiento;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_tipo_movimiento
  CHECK (
    tipo_movimiento IN (
      'ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE',
      'VENTA', 'DEVOLUCION', 'SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO',
      'DEVOLUCION_PROVEEDOR', 'ANULACION_VENTA'
    )
  ) NOT VALID;

-- Los movimientos de una venta se buscan por su referencia para anularla.
CREATE INDEX IF NOT EXISTS idx_movimientos_referencia
  ON movimientos_inventario (referencia);

-- 4. Indicadores (RF62): la anulación devuelve stock y resta de lo vendido.
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
  (m.tipo_movimiento = 'VENTA'
    OR (m.tipo_movimiento = 'SALIDA' AND s.motivo = 'VENTA')) AS es_venta,
  (m.tipo_movimiento IN ('SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO')) AS es_merma
FROM movimientos_inventario m
INNER JOIN productos p ON p.id_producto = m.id_producto
LEFT JOIN salidas_inventario s
  ON m.tipo_movimiento = 'SALIDA' AND s.numero_salida = m.referencia
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'ANULACION_VENTA') THEN 1
    WHEN m.tipo_movimiento IN ('SALIDA', 'VENTA', 'SALIDA_PERDIDA', 'SALIDA_DANO',
                               'SALIDA_VENCIMIENTO', 'DEVOLUCION_PROVEEDOR') THEN -1
    WHEN m.stock_nuevo IS NOT NULL AND m.stock_anterior IS NOT NULL
      THEN SIGN(m.stock_nuevo - m.stock_anterior)::int
    ELSE 0
  END AS signo
) sg;
