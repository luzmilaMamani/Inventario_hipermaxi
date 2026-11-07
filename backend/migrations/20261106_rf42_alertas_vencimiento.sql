-- RF42: alertas de lotes por vencer y vencidos.
-- Usa los días de anticipación por categoría de RF50
-- (fn_dias_anticipacion_vencimiento) para decidir cuándo avisar.

CREATE TABLE IF NOT EXISTS alertas_vencimiento (
  id_alerta SERIAL PRIMARY KEY,
  id_lote INTEGER NOT NULL REFERENCES lotes_productos(id_lote) ON DELETE CASCADE,
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  id_almacen INTEGER NOT NULL REFERENCES almacenes(id_almacen),
  tipo VARCHAR(20) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  fecha_vencimiento DATE NOT NULL,
  dias_anticipacion INTEGER,
  cantidad NUMERIC NOT NULL,
  fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_lectura TIMESTAMP,
  id_usuario_lectura INTEGER REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_alertas_venc_tipo CHECK (tipo IN ('POR_VENCER', 'VENCIDO')),
  CONSTRAINT chk_alertas_venc_estado CHECK (estado IN ('PENDIENTE', 'LEIDA')),
  -- No se generan alertas duplicadas para el mismo lote y tipo.
  CONSTRAINT uq_alertas_venc_lote_tipo UNIQUE (id_lote, tipo)
);

CREATE INDEX IF NOT EXISTS idx_alertas_venc_estado_fecha
  ON alertas_vencimiento (estado, fecha_generacion DESC);

-- Revisa los lotes con existencia y genera las alertas que falten.
-- Un lote que vence hoy ya se considera vencido (mismo criterio que FEFO, RF49).
-- Devuelve la cantidad de alertas nuevas.
CREATE OR REPLACE FUNCTION fn_generar_alertas_vencimiento()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_por_vencer INTEGER;
  v_vencidas INTEGER;
BEGIN
  INSERT INTO alertas_vencimiento (
    id_lote, id_producto, id_almacen, tipo, fecha_vencimiento, dias_anticipacion, cantidad
  )
  SELECT lp.id_lote, lp.id_producto, lp.id_almacen, 'POR_VENCER',
         lp.fecha_vencimiento, d.dias, lp.cantidad_actual
  FROM lotes_productos lp
  INNER JOIN productos p ON p.id_producto = lp.id_producto
  CROSS JOIN LATERAL (
    SELECT fn_dias_anticipacion_vencimiento(p.id_categoria) AS dias
  ) d
  WHERE lp.fecha_vencimiento IS NOT NULL
    AND lp.cantidad_actual > 0
    AND lp.fecha_vencimiento > CURRENT_DATE
    AND lp.fecha_vencimiento <= CURRENT_DATE + d.dias
  ON CONFLICT (id_lote, tipo) DO NOTHING;
  GET DIAGNOSTICS v_por_vencer = ROW_COUNT;

  INSERT INTO alertas_vencimiento (
    id_lote, id_producto, id_almacen, tipo, fecha_vencimiento, dias_anticipacion, cantidad
  )
  SELECT lp.id_lote, lp.id_producto, lp.id_almacen, 'VENCIDO',
         lp.fecha_vencimiento, NULL, lp.cantidad_actual
  FROM lotes_productos lp
  WHERE lp.fecha_vencimiento IS NOT NULL
    AND lp.cantidad_actual > 0
    AND lp.fecha_vencimiento <= CURRENT_DATE
  ON CONFLICT (id_lote, tipo) DO NOTHING;
  GET DIAGNOSTICS v_vencidas = ROW_COUNT;

  RETURN v_por_vencer + v_vencidas;
END;
$$;
