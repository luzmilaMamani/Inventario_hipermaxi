-- RF61: bloqueo temporal de lotes en cuarentena.
-- Un lote en CUARENTENA no cuenta como disponible y no se sugiere en FEFO
-- (que solo toma lotes DISPONIBLE o PROXIMO_A_VENCER). Cada bloqueo y liberación
-- queda registrado con motivo y usuario.

ALTER TABLE lotes_productos
  DROP CONSTRAINT IF EXISTS chk_lote_estado;

ALTER TABLE lotes_productos
  ADD CONSTRAINT chk_lote_estado
  CHECK (
    estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER', 'VENCIDO', 'BLOQUEADO', 'AGOTADO', 'CUARENTENA')
  );

CREATE TABLE IF NOT EXISTS historial_cuarentena_lotes (
  id_historial SERIAL PRIMARY KEY,
  id_lote INTEGER NOT NULL REFERENCES lotes_productos (id_lote),
  accion VARCHAR(20) NOT NULL,
  motivo TEXT NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL,
  id_usuario INTEGER NOT NULL REFERENCES usuarios (id_usuario),
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_historial_cuarentena_accion CHECK (accion IN ('BLOQUEO', 'LIBERACION')),
  CONSTRAINT chk_historial_cuarentena_motivo CHECK (LENGTH(BTRIM(motivo)) >= 5)
);

CREATE INDEX IF NOT EXISTS idx_historial_cuarentena_lote
  ON historial_cuarentena_lotes (id_lote, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_lotes_cuarentena
  ON lotes_productos (id_producto, id_almacen)
  WHERE cantidad_actual > 0 AND estado = 'CUARENTENA';

CREATE OR REPLACE FUNCTION fn_cantidad_cuarentena(p_id_producto INTEGER, p_id_almacen INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(cantidad_actual), 0)
  FROM lotes_productos
  WHERE id_producto = p_id_producto
    AND id_almacen = p_id_almacen
    AND cantidad_actual > 0
    AND estado = 'CUARENTENA';
$$;

-- Unidades físicas que no se pueden vender ni transferir.
CREATE OR REPLACE FUNCTION fn_cantidad_no_disponible(p_id_producto INTEGER, p_id_almacen INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT fn_cantidad_vencida(p_id_producto, p_id_almacen)
       + fn_cantidad_cuarentena(p_id_producto, p_id_almacen);
$$;

CREATE OR REPLACE VIEW vw_stock_disponible AS
SELECT
  s.id_stock,
  s.id_producto,
  s.id_almacen,
  s.cantidad,
  COALESCE(s.cantidad_reservada, 0) AS cantidad_reservada,
  fn_cantidad_vencida(s.id_producto, s.id_almacen) AS cantidad_vencida,
  GREATEST(
    s.cantidad - COALESCE(s.cantidad_reservada, 0)
      - fn_cantidad_no_disponible(s.id_producto, s.id_almacen),
    0
  ) AS cantidad_disponible,
  fn_cantidad_cuarentena(s.id_producto, s.id_almacen) AS cantidad_cuarentena
FROM stock s;

CREATE OR REPLACE FUNCTION fn_registrar_stock_disponible()
RETURNS TRIGGER AS $$
DECLARE
  v_no_disponible NUMERIC;
  v_antes NUMERIC := 0;
  v_ahora NUMERIC;
BEGIN
  -- El ingreso de productos terminados publica su propio evento más detallado.
  IF current_setting('inventario.omitir_stock_actualizado', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_no_disponible := fn_cantidad_no_disponible(NEW.id_producto, NEW.id_almacen);
  v_ahora := COALESCE(NEW.cantidad, 0) - COALESCE(NEW.cantidad_reservada, 0) - v_no_disponible;
  IF TG_OP = 'UPDATE' THEN
    v_antes := COALESCE(OLD.cantidad, 0) - COALESCE(OLD.cantidad_reservada, 0) - v_no_disponible;
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
