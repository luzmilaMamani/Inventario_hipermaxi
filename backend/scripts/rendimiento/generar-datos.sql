-- HT08 (HIP-255): carga de datos masivos para pruebas de rendimiento.
--
-- ¡SOLO PARA UNA BASE DE PRUEBAS! Borra productos, stock, lotes y movimientos.
-- Uso (sobre una base con el esquema y las migraciones al día):
--   psql -d hipermaxi_rendimiento -v productos=3000 -v almacenes=20 -v dias=365 \
--        -f scripts/rendimiento/generar-datos.sql
--
-- Volumen por defecto: 3.000 productos, 20 almacenes, 60.000 registros de stock,
-- ~120.000 lotes, 600.000 movimientos de un año, 40.000 salidas, 3.000
-- recepciones, 2.000 transferencias y 50.000 mensajes de integración.

\if :{?productos} \else \set productos 3000 \endif
\if :{?almacenes} \else \set almacenes 20 \endif
\if :{?dias} \else \set dias 365 \endif
\set ON_ERROR_STOP on
\timing on

BEGIN;
-- Sin triggers de alertas ni de Pub/Sub durante la carga.
SET session_replication_role = replica;
SELECT setseed(0.2026);

TRUNCATE movimientos_inventario, detalle_salidas, salidas_inventario, detalle_entradas,
  entradas_inventario, detalle_transferencia_lotes, detalle_transferencias, transferencias,
  ajustes_inventario, detalle_inventario_fisico, inventarios_fisicos, stock, lotes_productos,
  stock_ubicaciones, alertas_stock, alertas_vencimiento, eventos_stock_bajo,
  venta_recibida_detalle, venta_recibida, mensajes_integracion, productos
  RESTART IDENTITY CASCADE;

-- Almacenes adicionales hasta completar la cantidad pedida.
INSERT INTO almacenes (codigo, nombre, tipo, ciudad, activo, superficie_m2)
SELECT 'REN-' || LPAD(g::text, 3, '0'), 'Sucursal rendimiento ' || g, 'SUCURSAL',
       (ARRAY['La Paz', 'Cochabamba', 'Santa Cruz', 'Sucre', 'Tarija'])[1 + g % 5], TRUE, 2000
FROM generate_series(1, GREATEST(:almacenes - (SELECT COUNT(*) FROM almacenes), 0)) g;

INSERT INTO productos (codigo, codigo_barras, nombre, id_categoria, id_marca, id_unidad, controla_vencimiento,
  stock_minimo, stock_maximo, punto_reposicion, estado, precio, perecible, requiere_refrigeracion)
SELECT 'R-' || LPAD(g::text, 6, '0'), '779' || LPAD(g::text, 10, '0'), 'Producto de rendimiento ' || g,
       (SELECT id_categoria FROM categorias ORDER BY id_categoria OFFSET g % (SELECT COUNT(*) FROM categorias) LIMIT 1),
       (SELECT id_marca FROM marcas ORDER BY id_marca OFFSET g % (SELECT COUNT(*) FROM marcas) LIMIT 1),
       1, g % 3 <> 0, 20, 500, 40, CASE WHEN g % 50 = 0 THEN 'INACTIVO' ELSE 'ACTIVO' END,
       ROUND((2 + random() * 80)::numeric, 2), g % 7 = 0, g % 11 = 0
FROM generate_series(1, :productos) g;

-- Stock en todos los almacenes: productos × almacenes.
CREATE TEMP TABLE alm_ids AS SELECT id_almacen FROM almacenes WHERE activo ORDER BY id_almacen LIMIT :almacenes;

INSERT INTO lotes_productos (id_producto, id_almacen, numero_lote, fecha_ingreso, fecha_vencimiento,
  cantidad_inicial, cantidad_actual, estado)
SELECT p.id_producto, a.id_almacen, 'RL' || p.id_producto || '-' || a.id_almacen || '-' || n,
       CURRENT_DATE - (300 - n * 90),
       CASE WHEN p.controla_vencimiento THEN CURRENT_DATE + ((p.id_producto + a.id_almacen * 7 + n * 40) % 400) - 20 END,
       200, (50 + (p.id_producto * a.id_almacen + n) % 150)::int, 'DISPONIBLE'
FROM productos p CROSS JOIN alm_ids a CROSS JOIN generate_series(1, 1 + (abs(hashint4(p.id_producto)) % 3)) n;

UPDATE lotes_productos SET estado = 'VENCIDO' WHERE fecha_vencimiento <= CURRENT_DATE;
UPDATE lotes_productos SET estado = 'PROXIMO_A_VENCER'
  WHERE estado = 'DISPONIBLE' AND fecha_vencimiento <= CURRENT_DATE + 30;

INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada, fecha_actualizacion)
SELECT id_producto, id_almacen, SUM(cantidad_actual), 0, CURRENT_TIMESTAMP
FROM lotes_productos GROUP BY id_producto, id_almacen;

-- Recepciones con diferencias en ~15 % de las líneas.
INSERT INTO entradas_inventario (numero_entrada, id_almacen, id_usuario, fecha_entrada, origen, estado, stock_confirmado)
SELECT 'RENT-' || LPAD(g::text, 6, '0'), (SELECT id_almacen FROM alm_ids OFFSET g % :almacenes LIMIT 1), 1,
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval,
       'Proveedor ' || (1 + g % 25), 'CONFIRMADA', TRUE
FROM generate_series(1, 3000) g;

INSERT INTO detalle_entradas (id_entrada, id_producto, id_lote, cantidad_solicitada, cantidad_recibida)
SELECT e.id_entrada, l.id_producto, l.id_lote, 100, CASE WHEN (e.id_entrada + k) % 7 = 0 THEN 95 ELSE 100 END
FROM entradas_inventario e
CROSS JOIN generate_series(1, 5) k
CROSS JOIN LATERAL (
  SELECT id_lote, id_producto FROM lotes_productos
  WHERE id_almacen = e.id_almacen AND id_producto = 1 + ((e.id_entrada * 13 + k * 101) % :productos)
  LIMIT 1
) l;

-- Salidas (ventas y mermas) con su detalle.
INSERT INTO salidas_inventario (numero_salida, id_almacen, id_usuario, fecha_salida, motivo, estado, subtipo_perdida)
SELECT 'RSAL-' || LPAD(g::text, 7, '0'), (SELECT id_almacen FROM alm_ids OFFSET g % :almacenes LIMIT 1), 1,
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval - ((g % 13) || ' hours')::interval,
       CASE WHEN g % 25 = 0 THEN 'PERDIDA' WHEN g % 25 = 1 THEN 'DANO' WHEN g % 25 = 2 THEN 'VENCIMIENTO' ELSE 'VENTA' END,
       'CONFIRMADA', CASE WHEN g % 25 = 0 THEN 'ROBO' WHEN g % 25 = 1 THEN 'ROTO' END
FROM generate_series(1, 40000) g;

INSERT INTO detalle_salidas (id_salida, id_producto, id_lote, cantidad, precio_unitario, valor_total)
SELECT s.id_salida, l.id_producto, l.id_lote, 1 + s.id_salida % 5, p.precio, p.precio * (1 + s.id_salida % 5)
FROM salidas_inventario s
CROSS JOIN LATERAL (
  SELECT id_lote, id_producto FROM lotes_productos
  WHERE id_almacen = s.id_almacen AND id_producto = 1 + ((s.id_salida * 31) % :productos)
  LIMIT 1
) l
JOIN productos p ON p.id_producto = l.id_producto;

-- Transferencias recibidas.
INSERT INTO transferencias (numero_transferencia, almacen_origen, almacen_destino, id_usuario_solicita, fecha_solicitud,
  fecha_envio, fecha_recepcion, fecha_llegada_estimada, estado)
SELECT 'RTRF-' || LPAD(g::text, 6, '0'), o.id_almacen, d.id_almacen, 1,
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval,
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval + interval '4 hours',
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval + ((10 + g % 70) || ' hours')::interval,
       (CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval + interval '2 days')::date, 'RECIBIDA'
FROM generate_series(1, 2000) g
CROSS JOIN LATERAL (SELECT id_almacen FROM alm_ids OFFSET g % :almacenes LIMIT 1) o
CROSS JOIN LATERAL (SELECT id_almacen FROM alm_ids OFFSET (g + 1) % :almacenes LIMIT 1) d;

INSERT INTO detalle_transferencias (id_transferencia, id_producto, cantidad_solicitada, cantidad_enviada, cantidad_recibida, diferencia)
SELECT t.id_transferencia, 1 + ((t.id_transferencia * 17 + k) % :productos), 20, 20, 20, 0
FROM transferencias t CROSS JOIN generate_series(1, 3) k;

-- ~600.000 movimientos distribuidos en el período (historial de existencias).
INSERT INTO movimientos_inventario (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
  stock_anterior, stock_nuevo, referencia, fecha_movimiento)
SELECT (1 + (g::bigint * 7919) % :productos)::int,
       (SELECT id_almacen FROM alm_ids OFFSET g % :almacenes LIMIT 1),
       1, t.tipo, 1 + g % 9, 100,
       CASE WHEN t.tipo IN ('ENTRADA', 'DEVOLUCION') THEN 100 + 1 + g % 9 ELSE 100 - 1 - g % 9 END,
       'RMOV-' || g,
       CURRENT_TIMESTAMP - ((g % (:dias * 24 * 60)) || ' minutes')::interval
FROM generate_series(1, 600000) g
CROSS JOIN LATERAL (
  SELECT (ARRAY['ENTRADA', 'SALIDA', 'SALIDA', 'SALIDA', 'VENTA', 'TRANSFERENCIA', 'AJUSTE', 'SALIDA_DANO'])[1 + g % 8] AS tipo
) t;

-- Inventarios físicos.
INSERT INTO inventarios_fisicos (numero_inventario, id_almacen, id_usuario, fecha_programada, fecha_inicio, fecha_fin, estado)
SELECT 'RINV-' || g, (SELECT id_almacen FROM alm_ids OFFSET g % :almacenes LIMIT 1), 1,
       CURRENT_DATE - (g % :dias), CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval,
       CURRENT_TIMESTAMP - ((g % :dias) || ' days')::interval + interval '5 hours', 'FINALIZADO'
FROM generate_series(1, 200) g;

INSERT INTO detalle_inventario_fisico (id_inventario, id_producto, cantidad_sistema, cantidad_fisica)
SELECT i.id_inventario, 1 + ((i.id_inventario * 37 + k) % :productos), 100, CASE WHEN k % 9 = 0 THEN 98 ELSE 100 END
FROM inventarios_fisicos i CROSS JOIN generate_series(1, 50) k;

-- Mensajes de integración (dashboard RF75).
INSERT INTO mensajes_integracion (tipo_mensaje, id_mensaje, payload, estado, error, fecha_recepcion, sistema,
  fecha_publicacion, fecha_procesado, latencia_ms)
SELECT CASE WHEN g % 2 = 0 THEN 'venta.confirmada' ELSE 'SOLICITUD_MATERIALES' END, 'rend-' || g, '{}'::jsonb,
       CASE WHEN g % 40 = 0 THEN 'ERROR' ELSE 'PROCESADO' END,
       CASE WHEN g % 40 = 0 THEN 'Stock insuficiente' END,
       CURRENT_TIMESTAMP - ((g % (:dias * 24)) || ' hours')::interval,
       CASE WHEN g % 2 = 0 THEN 'VENTAS' ELSE 'PRODUCCION_LOGISTICA' END,
       CURRENT_TIMESTAMP - ((g % (:dias * 24)) || ' hours')::interval - interval '1 second',
       CURRENT_TIMESTAMP - ((g % (:dias * 24)) || ' hours')::interval, 200 + g % 2000
FROM generate_series(1, 50000) g;

SET session_replication_role = origin;
COMMIT;

ANALYZE;

SELECT (SELECT COUNT(*) FROM productos) AS productos,
       (SELECT COUNT(*) FROM almacenes) AS almacenes,
       (SELECT COUNT(*) FROM stock) AS stock,
       (SELECT COUNT(*) FROM lotes_productos) AS lotes,
       (SELECT COUNT(*) FROM movimientos_inventario) AS movimientos,
       (SELECT COUNT(*) FROM salidas_inventario) AS salidas,
       (SELECT COUNT(*) FROM mensajes_integracion) AS mensajes;
