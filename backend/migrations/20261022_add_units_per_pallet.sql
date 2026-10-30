ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS unidades_por_pale INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.productos'::regclass
      AND conname = 'chk_productos_unidades_por_pale_positivo'
  ) THEN
    ALTER TABLE productos
      ADD CONSTRAINT chk_productos_unidades_por_pale_positivo
      CHECK (unidades_por_pale IS NULL OR unidades_por_pale > 0);
  END IF;
END;
$$;
