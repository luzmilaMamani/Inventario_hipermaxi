-- HIP-260: Inventario informa a Producción y Logística los lotes que vencen en
-- menos de dos meses (evento PRODUCTOS_PROXIMOS_VENCER). Cada lote se informa una
-- sola vez, al entrar en esa ventana; esta tabla guarda cuáles ya se enviaron.
CREATE TABLE IF NOT EXISTS lotes_vencimiento_informados (
  id_lote INTEGER PRIMARY KEY REFERENCES lotes_productos (id_lote) ON DELETE CASCADE,
  fecha_vencimiento DATE NOT NULL,
  id_evento BIGINT NOT NULL REFERENCES eventos_integracion (id_evento),
  fecha_informado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
