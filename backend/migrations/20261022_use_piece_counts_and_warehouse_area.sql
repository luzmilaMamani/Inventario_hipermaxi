BEGIN;

INSERT INTO unidades_medida (nombre, abreviatura)
SELECT 'Unidad', 'UND'
WHERE NOT EXISTS (
  SELECT 1 FROM unidades_medida WHERE UPPER(abreviatura) = 'UND'
);

UPDATE unidades_medida
SET nombre = 'Unidad'
WHERE UPPER(abreviatura) = 'UND';

UPDATE productos
SET id_unidad = (
  SELECT id_unidad
  FROM unidades_medida
  WHERE UPPER(abreviatura) = 'UND'
  ORDER BY id_unidad
  LIMIT 1
);

ALTER TABLE almacenes
  ADD COLUMN IF NOT EXISTS superficie_m2 NUMERIC(12, 2);

UPDATE almacenes
SET superficie_m2 = 7280
WHERE superficie_m2 IS NULL;

ALTER TABLE almacenes
  ALTER COLUMN superficie_m2 SET DEFAULT 7280,
  ALTER COLUMN superficie_m2 SET NOT NULL;

DO $$
DECLARE
  item RECORD;
  nombre_restriccion TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('productos', 'stock_minimo'),
      ('productos', 'stock_maximo'),
      ('productos', 'punto_reposicion'),
      ('stock', 'cantidad'),
      ('stock', 'cantidad_reservada'),
      ('stock_ubicaciones', 'cantidad'),
      ('lotes_productos', 'cantidad_inicial'),
      ('lotes_productos', 'cantidad_actual'),
      ('detalle_entradas', 'cantidad_solicitada'),
      ('detalle_entradas', 'cantidad_recibida'),
      ('detalle_salidas', 'cantidad'),
      ('detalle_transferencias', 'cantidad_solicitada'),
      ('detalle_transferencias', 'cantidad_enviada'),
      ('detalle_transferencias', 'cantidad_recibida'),
      ('diferencias_recepcion', 'cantidad'),
      ('movimientos_inventario', 'cantidad'),
      ('movimientos_inventario', 'stock_anterior'),
      ('movimientos_inventario', 'stock_nuevo'),
      ('ajustes_inventario', 'cantidad_anterior'),
      ('ajustes_inventario', 'cantidad_nueva'),
      ('detalle_inventario_fisico', 'cantidad_sistema'),
      ('detalle_inventario_fisico', 'cantidad_fisica'),
      ('eventos_stock_bajo', 'cantidad_anterior'),
      ('eventos_stock_bajo', 'cantidad_actual')
    ) AS columnas(tabla, columna)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.tabla
        AND column_name = item.columna
    ) THEN
      nombre_restriccion := format('chk_%s_%s_unidades_enteras', item.tabla, item.columna);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = format('public.%I', item.tabla)::regclass
          AND conname = nombre_restriccion
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I = trunc(%I))',
          item.tabla,
          nombre_restriccion,
          item.columna,
          item.columna,
          item.columna
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
