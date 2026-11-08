-- RF55: devoluciones de clientes que reingresan al inventario.
-- Cada devolución referencia la venta original (salida con motivo VENTA).
-- Las líneas aptas vuelven al stock con un movimiento DEVOLUCION; las no
-- aptas reingresan y salen en el mismo momento como salida por daño, de modo
-- que el stock no aumenta y el kardex queda cuadrado.

CREATE TABLE IF NOT EXISTS devoluciones (
  id_devolucion SERIAL PRIMARY KEY,
  numero_devolucion VARCHAR(30) NOT NULL UNIQUE,
  id_salida_venta INTEGER NOT NULL REFERENCES salidas_inventario (id_salida),
  id_almacen INTEGER NOT NULL REFERENCES almacenes (id_almacen),
  id_usuario INTEGER NOT NULL REFERENCES usuarios (id_usuario),
  -- Salida por daño generada para las líneas no aptas (NULL si todo fue apto).
  id_salida_dano INTEGER REFERENCES salidas_inventario (id_salida),
  fecha_devolucion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS detalle_devoluciones (
  id_detalle_devolucion SERIAL PRIMARY KEY,
  id_devolucion INTEGER NOT NULL REFERENCES devoluciones (id_devolucion) ON DELETE CASCADE,
  -- Línea de la venta que se devuelve: fija producto y lote vendidos.
  id_detalle_salida INTEGER NOT NULL REFERENCES detalle_salidas (id_detalle_salida),
  id_producto INTEGER NOT NULL REFERENCES productos (id_producto),
  id_lote INTEGER NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL,
  estado_producto VARCHAR(10) NOT NULL,
  motivo TEXT,
  -- Movimiento que reingresa la mercadería (DEVOLUCION).
  id_movimiento BIGINT NOT NULL REFERENCES movimientos_inventario (id_movimiento),
  -- Movimiento de salida por daño, solo para líneas no aptas.
  id_movimiento_dano BIGINT REFERENCES movimientos_inventario (id_movimiento),
  CONSTRAINT fk_detalle_devolucion_lote_producto
    FOREIGN KEY (id_lote, id_producto) REFERENCES lotes_productos (id_lote, id_producto),
  CONSTRAINT chk_detalle_devolucion_cantidad
    CHECK (cantidad > 0 AND cantidad = TRUNC(cantidad)),
  CONSTRAINT chk_detalle_devolucion_estado
    CHECK (estado_producto IN ('APTO', 'NO_APTO')),
  -- Lo no apto debe quedar registrado con su motivo y su salida por daño.
  CONSTRAINT chk_detalle_devolucion_no_apto
    CHECK (
      estado_producto = 'APTO'
      OR (
        LENGTH(BTRIM(COALESCE(motivo, ''))) >= 5
        AND id_movimiento_dano IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_venta
  ON devoluciones (id_salida_venta);

CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha
  ON devoluciones (fecha_devolucion DESC);

-- Suma de lo ya devuelto por línea de venta (control de "no más de lo vendido").
CREATE INDEX IF NOT EXISTS idx_detalle_devoluciones_detalle_salida
  ON detalle_devoluciones (id_detalle_salida);
