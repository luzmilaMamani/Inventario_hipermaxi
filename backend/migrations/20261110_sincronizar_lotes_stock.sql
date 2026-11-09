-- Regla: en cada producto y almacén, stock.cantidad = suma de cantidad_actual de sus lotes.
-- Transferencias y ajustes solo tocaban stock, y las recepciones sumaban al lote
-- antes de confirmarse. Esta migración prepara el modelo y corrige los saldos.

-- Saldos heredados sin fecha conocida: se identifican con el prefijo SALDO-.
CREATE OR REPLACE FUNCTION fn_lotes_exigir_vencimiento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_vencimiento IS NULL
     AND NEW.numero_lote NOT LIKE 'SALDO-%'
     AND EXISTS (
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

-- Lotes de los que salió cada línea de transferencia y lote que los recibió.
CREATE TABLE IF NOT EXISTS detalle_transferencia_lotes (
  id_detalle_transferencia_lote SERIAL PRIMARY KEY,
  id_detalle_transferencia INTEGER NOT NULL
    REFERENCES detalle_transferencias (id_detalle_transferencia) ON DELETE CASCADE,
  id_lote_origen INTEGER NOT NULL REFERENCES lotes_productos (id_lote),
  cantidad_enviada NUMERIC(12, 2) NOT NULL,
  cantidad_recibida NUMERIC(12, 2) NOT NULL DEFAULT 0,
  id_lote_destino INTEGER REFERENCES lotes_productos (id_lote),
  CONSTRAINT chk_transferencia_lote_enviada CHECK (cantidad_enviada > 0),
  CONSTRAINT chk_transferencia_lote_recibida CHECK (cantidad_recibida >= 0)
);

CREATE INDEX IF NOT EXISTS idx_detalle_transferencia_lotes_detalle
  ON detalle_transferencia_lotes (id_detalle_transferencia);

-- Fecha para el lote nuevo cuando un ajuste suma a un producto sin lotes vigentes.
ALTER TABLE ajustes_inventario
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_lote DATE;

CREATE OR REPLACE FUNCTION impedir_cambio_ajuste()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado = 'PENDIENTE'
     AND NEW.estado IN ('APROBADO', 'RECHAZADO')
     AND NEW.numero_ajuste IS NOT DISTINCT FROM OLD.numero_ajuste
     AND NEW.id_almacen IS NOT DISTINCT FROM OLD.id_almacen
     AND NEW.id_producto IS NOT DISTINCT FROM OLD.id_producto
     AND NEW.id_lote IS NOT DISTINCT FROM OLD.id_lote
     AND NEW.id_usuario IS NOT DISTINCT FROM OLD.id_usuario
     AND NEW.cantidad_anterior IS NOT DISTINCT FROM OLD.cantidad_anterior
     AND NEW.cantidad_nueva IS NOT DISTINCT FROM OLD.cantidad_nueva
     AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
     AND NEW.comentario IS NOT DISTINCT FROM OLD.comentario
     AND NEW.fecha_ajuste IS NOT DISTINCT FROM OLD.fecha_ajuste
     AND NEW.requiere_aprobacion IS NOT DISTINCT FROM OLD.requiere_aprobacion
     AND NEW.valor_ajuste IS NOT DISTINCT FROM OLD.valor_ajuste
     AND NEW.fecha_vencimiento_lote IS NOT DISTINCT FROM OLD.fecha_vencimiento_lote
  THEN
    IF NEW.id_usuario_aprueba IS NULL THEN
      RAISE EXCEPTION 'La decisión del ajuste debe registrar el usuario que la toma';
    END IF;
    IF NEW.id_usuario_aprueba = OLD.id_usuario THEN
      RAISE EXCEPTION 'Quien registró el ajuste no puede aprobarlo ni rechazarlo';
    END IF;
    NEW.fecha_aprobacion := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Una justificación de ajuste registrada no puede modificarse ni eliminarse';
END;
$$;

-- Las recepciones sin confirmar ya no cuentan en el lote: se sumarán al confirmar.
UPDATE lotes_productos lp
SET cantidad_actual = GREATEST(lp.cantidad_actual - pendiente.cantidad, 0),
    cantidad_inicial = GREATEST(lp.cantidad_inicial - pendiente.cantidad, 0)
FROM (
  SELECT de.id_lote, SUM(de.cantidad_recibida) AS cantidad
  FROM detalle_entradas de
  INNER JOIN entradas_inventario e ON e.id_entrada = de.id_entrada
  WHERE e.stock_confirmado = FALSE
    AND de.id_lote IS NOT NULL
  GROUP BY de.id_lote
) pendiente
WHERE lp.id_lote = pendiente.id_lote;

-- Corrige los descuadres históricos tomando stock como la cantidad real.
DO $$
DECLARE
  fila RECORD;
  lote RECORD;
  exceso NUMERIC;
  tomar NUMERIC;
BEGIN
  FOR fila IN
    SELECT
      COALESCE(s.id_producto, l.id_producto) AS id_producto,
      COALESCE(s.id_almacen, l.id_almacen) AS id_almacen,
      COALESCE(s.cantidad, 0) AS en_stock,
      COALESCE(l.total, 0) AS en_lotes
    FROM stock s
    FULL JOIN (
      SELECT id_producto, id_almacen, SUM(cantidad_actual) AS total
      FROM lotes_productos
      GROUP BY id_producto, id_almacen
    ) l ON l.id_producto = s.id_producto AND l.id_almacen = s.id_almacen
    WHERE COALESCE(s.cantidad, 0) <> COALESCE(l.total, 0)
  LOOP
    IF fila.en_stock > fila.en_lotes THEN
      INSERT INTO lotes_productos
        (id_producto, id_almacen, numero_lote, fecha_ingreso, fecha_vencimiento,
         cantidad_inicial, cantidad_actual)
      VALUES (
        fila.id_producto,
        fila.id_almacen,
        'SALDO-' || fila.id_producto || '-' || fila.id_almacen,
        CURRENT_DATE,
        NULL,
        fila.en_stock - fila.en_lotes,
        fila.en_stock - fila.en_lotes
      )
      ON CONFLICT (id_producto, id_almacen, numero_lote) DO UPDATE
        SET cantidad_inicial = lotes_productos.cantidad_inicial + EXCLUDED.cantidad_inicial,
            cantidad_actual = lotes_productos.cantidad_actual + EXCLUDED.cantidad_actual,
            estado = CASE
              WHEN lotes_productos.estado = 'AGOTADO' THEN 'DISPONIBLE'
              ELSE lotes_productos.estado
            END;
    ELSE
      exceso := fila.en_lotes - fila.en_stock;
      FOR lote IN
        SELECT id_lote, cantidad_actual
        FROM lotes_productos
        WHERE id_producto = fila.id_producto
          AND id_almacen = fila.id_almacen
          AND cantidad_actual > 0
        ORDER BY fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id_lote ASC
      LOOP
        EXIT WHEN exceso <= 0;
        tomar := LEAST(lote.cantidad_actual, exceso);
        UPDATE lotes_productos
        SET cantidad_actual = cantidad_actual - tomar,
            estado = CASE WHEN cantidad_actual - tomar = 0 THEN 'AGOTADO' ELSE estado END
        WHERE id_lote = lote.id_lote;
        exceso := exceso - tomar;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
