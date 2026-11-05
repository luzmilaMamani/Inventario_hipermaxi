UPDATE productos
SET codigo_barras = NULL
WHERE codigo_barras IS NOT NULL
  AND BTRIM(codigo_barras) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM productos
    WHERE codigo_barras IS NOT NULL
    GROUP BY codigo_barras
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay códigos de barras duplicados. Corrígelos antes de crear el índice único.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo_barras
  ON productos (codigo_barras)
  WHERE codigo_barras IS NOT NULL;
