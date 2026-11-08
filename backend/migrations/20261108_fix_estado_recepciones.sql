-- Arreglo: el registro de recepciones (RF20/RF22) guarda las entradas con
-- estado RECIBIDA, pero chk_entrada_estado solo permitía PENDIENTE,
-- CONFIRMADA y CANCELADA, por lo que en una base nueva toda recepción fallaba.

ALTER TABLE entradas_inventario
  DROP CONSTRAINT IF EXISTS chk_entrada_estado;

ALTER TABLE entradas_inventario
  ADD CONSTRAINT chk_entrada_estado
  CHECK (estado IN ('PENDIENTE', 'RECIBIDA', 'CONFIRMADA', 'CANCELADA'));
