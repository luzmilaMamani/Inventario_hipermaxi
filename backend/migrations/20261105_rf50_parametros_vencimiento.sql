-- RF50: días de anticipación de las alertas de vencimiento por categoría.
-- Existe un valor general (fila única) que se aplica a las categorías
-- que no tienen un valor propio configurado.

CREATE TABLE IF NOT EXISTS parametro_vencimiento_general (
  id_parametro SMALLINT PRIMARY KEY DEFAULT 1,
  dias_anticipacion INTEGER NOT NULL DEFAULT 30,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INTEGER REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_param_venc_general_unico CHECK (id_parametro = 1),
  CONSTRAINT chk_param_venc_general_dias CHECK (dias_anticipacion > 0)
);

INSERT INTO parametro_vencimiento_general (id_parametro, dias_anticipacion)
VALUES (1, 30)
ON CONFLICT (id_parametro) DO NOTHING;

CREATE TABLE IF NOT EXISTS parametros_vencimiento_categoria (
  id_categoria INTEGER PRIMARY KEY
    REFERENCES categorias(id_categoria) ON DELETE CASCADE,
  dias_anticipacion INTEGER NOT NULL,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INTEGER REFERENCES usuarios(id_usuario),
  CONSTRAINT chk_param_venc_categoria_dias CHECK (dias_anticipacion > 0)
);

-- Días de anticipación efectivos de una categoría (propio o general).
CREATE OR REPLACE FUNCTION fn_dias_anticipacion_vencimiento(p_categoria INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT dias_anticipacion
       FROM parametros_vencimiento_categoria
      WHERE id_categoria = p_categoria),
    (SELECT dias_anticipacion
       FROM parametro_vencimiento_general
      WHERE id_parametro = 1),
    30
  );
$$;
