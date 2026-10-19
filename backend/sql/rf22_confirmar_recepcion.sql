-- RF22: una recepción confirmada actualiza el stock una sola vez.

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
