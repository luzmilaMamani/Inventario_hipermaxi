-- RF20: cantidad recibida y estado de verificación en el detalle de la recepción.
-- También guarda el resultado general en la cabecera de la recepción.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'detalle_entradas'
      AND column_name = 'estado_verificacion'
  ) THEN
    ALTER TABLE detalle_entradas
      ADD COLUMN estado_verificacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'entradas_inventario'
      AND column_name = 'resultado_verificacion'
  ) THEN
    ALTER TABLE entradas_inventario
      ADD COLUMN resultado_verificacion VARCHAR(20);
  END IF;
END $$;
