-- Arreglo: las salidas por PERDIDA, DANO y VENCIMIENTO registran movimientos
-- SALIDA_PERDIDA, SALIDA_DANO y SALIDA_VENCIMIENTO, pero esos tipos solo se
-- habilitaban con el script manual correr_este_sql.sql. Sin él, la baja de
-- lotes vencidos (RF27/RF43) fallaba por chk_tipo_movimiento.
-- NOT VALID: no se revalidan movimientos históricos.

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS chk_tipo_movimiento;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_tipo_movimiento
  CHECK (
    tipo_movimiento IN (
      'ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE',
      'VENTA', 'DEVOLUCION', 'SALIDA_PERDIDA', 'SALIDA_DANO', 'SALIDA_VENCIMIENTO'
    )
  ) NOT VALID;
