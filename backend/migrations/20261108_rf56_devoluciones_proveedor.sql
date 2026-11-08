-- RF56: devoluciones a proveedor de mercadería defectuosa.
-- Cada devolución referencia una recepción confirmada (entradas_inventario) y
-- su proveedor. Cada línea apunta a la línea de la recepción, que fija el
-- producto y el lote recibidos, para controlar que no se devuelva más de lo
-- recibido. Al confirmarse, el stock y el lote disminuyen y se registra un
-- movimiento DEVOLUCION_PROVEEDOR. La reposición del proveedor se sigue con
-- estado_reposicion.

-- RF22 crea stock_confirmado al usar recepciones por primera vez; se asegura
-- aquí con la misma regla para poder exigir recepciones confirmadas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'entradas_inventario'
      AND column_name = 'stock_confirmado'
  ) THEN
    ALTER TABLE entradas_inventario
      ADD COLUMN stock_confirmado BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE entradas_inventario
      SET stock_confirmado = TRUE
      WHERE estado = 'RECIBIDA';
  END IF;
END $$;

-- Nuevo tipo de movimiento de salida.
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_tipo_movimiento;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_tipo_movimiento
  CHECK (
    tipo_movimiento IN (
      'ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE',
      'VENTA', 'DEVOLUCION', 'SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO',
      'DEVOLUCION_PROVEEDOR'
    )
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
  id_devolucion_proveedor SERIAL PRIMARY KEY,
  numero_devolucion VARCHAR(30) NOT NULL UNIQUE,
  id_entrada INTEGER NOT NULL REFERENCES entradas_inventario (id_entrada),
  id_almacen INTEGER NOT NULL REFERENCES almacenes (id_almacen),
  -- Proveedor de la recepción (entradas_inventario.origen) al momento de devolver.
  proveedor VARCHAR(150) NOT NULL,
  motivo TEXT NOT NULL,
  observaciones TEXT,
  id_usuario INTEGER NOT NULL REFERENCES usuarios (id_usuario),
  fecha_devolucion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA',
  -- Seguimiento de la reposición por parte del proveedor.
  estado_reposicion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  fecha_reposicion TIMESTAMP,
  id_usuario_reposicion INTEGER REFERENCES usuarios (id_usuario),
  observacion_reposicion TEXT,
  CONSTRAINT chk_devolucion_proveedor_estado
    CHECK (estado IN ('CONFIRMADA')),
  CONSTRAINT chk_devolucion_proveedor_motivo
    CHECK (LENGTH(BTRIM(motivo)) >= 5),
  CONSTRAINT chk_devolucion_proveedor_reposicion
    CHECK (estado_reposicion IN ('PENDIENTE', 'REPUESTA', 'SIN_REPOSICION')),
  -- Cerrar la reposición registra quién y cuándo.
  CONSTRAINT chk_devolucion_proveedor_reposicion_registrada
    CHECK (
      estado_reposicion = 'PENDIENTE'
      OR (fecha_reposicion IS NOT NULL AND id_usuario_reposicion IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS detalle_devoluciones_proveedor (
  id_detalle_devolucion_proveedor SERIAL PRIMARY KEY,
  id_devolucion_proveedor INTEGER NOT NULL
    REFERENCES devoluciones_proveedor (id_devolucion_proveedor) ON DELETE CASCADE,
  -- Línea de la recepción que se devuelve: fija producto y lote recibidos.
  id_detalle_entrada INTEGER NOT NULL REFERENCES detalle_entradas (id_detalle_entrada),
  id_producto INTEGER NOT NULL REFERENCES productos (id_producto),
  id_lote INTEGER REFERENCES lotes_productos (id_lote),
  cantidad NUMERIC(12, 2) NOT NULL,
  -- Detalle del defecto de esa línea (opcional; el motivo general está en la cabecera).
  observacion TEXT,
  id_movimiento BIGINT NOT NULL REFERENCES movimientos_inventario (id_movimiento),
  CONSTRAINT chk_detalle_devolucion_proveedor_cantidad
    CHECK (cantidad > 0 AND cantidad = TRUNC(cantidad))
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_entrada
  ON devoluciones_proveedor (id_entrada);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_fecha
  ON devoluciones_proveedor (fecha_devolucion DESC);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_reposicion
  ON devoluciones_proveedor (estado_reposicion)
  WHERE estado_reposicion = 'PENDIENTE';

-- Suma de lo ya devuelto por línea de recepción ("no más de lo recibido").
CREATE INDEX IF NOT EXISTS idx_detalle_devoluciones_proveedor_detalle_entrada
  ON detalle_devoluciones_proveedor (id_detalle_entrada);
