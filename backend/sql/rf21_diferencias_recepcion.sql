CREATE TABLE IF NOT EXISTS diferencias_recepcion (
    id_diferencia SERIAL PRIMARY KEY,
    id_entrada INT NOT NULL,
    id_producto INT NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('FALTANTE', 'SOBRANTE', 'DANADO')),
    cantidad NUMERIC(14,2) NOT NULL CHECK (cantidad > 0),
    observaciones TEXT,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario INT NOT NULL,
    CONSTRAINT fk_dif_entrada FOREIGN KEY (id_entrada) REFERENCES entradas_inventario(id_entrada) ON DELETE CASCADE,
    CONSTRAINT fk_dif_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    CONSTRAINT fk_dif_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);