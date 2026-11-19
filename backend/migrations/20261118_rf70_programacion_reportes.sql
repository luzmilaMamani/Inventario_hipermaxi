-- RF70 (HIP-241): programación del envío automático de reportes por correo y
-- bitácora de cada envío.

CREATE TABLE IF NOT EXISTS programaciones_reporte (
  id_programacion SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  tipo_reporte VARCHAR(40) NOT NULL,
  frecuencia VARCHAR(10) NOT NULL,
  hora TIME NOT NULL DEFAULT '07:00',
  -- SEMANAL: 1 = lunes ... 7 = domingo. MENSUAL: día 1 a 28 (existe en todo mes).
  dia_semana SMALLINT,
  dia_mes SMALLINT,
  destinatarios TEXT[] NOT NULL,
  -- Filtros del reporte (por ejemplo { "id_almacen": 2 }).
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  proximo_envio TIMESTAMP NOT NULL,
  ultimo_envio TIMESTAMP,
  id_usuario_crea INTEGER REFERENCES usuarios (id_usuario),
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_programacion_nombre CHECK (length(btrim(nombre)) >= 3),
  CONSTRAINT chk_programacion_tipo CHECK (
    tipo_reporte IN ('EXISTENCIAS', 'INDICADORES', 'STOCK_BAJO', 'PERDIDAS', 'VENCIMIENTOS_LOTES')
  ),
  CONSTRAINT chk_programacion_frecuencia CHECK (frecuencia IN ('DIARIA', 'SEMANAL', 'MENSUAL')),
  CONSTRAINT chk_programacion_dia_semana CHECK (
    (frecuencia <> 'SEMANAL' AND dia_semana IS NULL)
    OR (frecuencia = 'SEMANAL' AND dia_semana BETWEEN 1 AND 7)
  ),
  CONSTRAINT chk_programacion_dia_mes CHECK (
    (frecuencia <> 'MENSUAL' AND dia_mes IS NULL)
    OR (frecuencia = 'MENSUAL' AND dia_mes BETWEEN 1 AND 28)
  ),
  CONSTRAINT chk_programacion_destinatarios CHECK (cardinality(destinatarios) BETWEEN 1 AND 20)
);

-- El proceso programado solo busca las activas que ya vencieron.
CREATE INDEX IF NOT EXISTS idx_programaciones_reporte_pendientes
  ON programaciones_reporte (proximo_envio)
  WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS bitacora_envios_reporte (
  id_envio BIGSERIAL PRIMARY KEY,
  id_programacion INTEGER NOT NULL
    REFERENCES programaciones_reporte (id_programacion) ON DELETE CASCADE,
  fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(10) NOT NULL,
  destinatarios TEXT[] NOT NULL,
  registros INTEGER,
  -- TRUE cuando un usuario pidió "Enviar ahora".
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  id_usuario INTEGER REFERENCES usuarios (id_usuario),
  mensaje_error TEXT,
  CONSTRAINT chk_bitacora_envio_estado CHECK (estado IN ('ENVIADO', 'ERROR')),
  CONSTRAINT chk_bitacora_envio_error CHECK (estado = 'ENVIADO' OR mensaje_error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_bitacora_envios_programacion
  ON bitacora_envios_reporte (id_programacion, fecha_envio DESC);
