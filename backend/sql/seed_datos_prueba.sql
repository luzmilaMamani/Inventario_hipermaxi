-- SOLO PARA PRUEBAS: este script borra los registros actuales mediante TRUNCATE.
-- Respaldar la base antes de ejecutarlo. Para instalaciones existentes, ejecutar
-- primero las migraciones versionadas con `npm run migrate`.

--1. Si tienen pgAdmin abierto y les sale un error en rojo, primero ejecuten ROLLBACK;
--2. Copien y peguen TODO el bloque de SQL de abajo en el Query Tool y denle a F5.
--3. Con eso tendrán los datos de prueba perfectos y todas las tablas nuevas (transferencias, notificaciones, etc.) listas.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- 1. Limpiar la sesión en caso de error
ROLLBACK;

-- 2. Crear/Actualizar la estructura (RF25 al RF29)
BEGIN;

-- Agregar columnas faltantes en salidas
ALTER TABLE salidas_inventario ADD COLUMN IF NOT EXISTS subtipo_perdida VARCHAR(50);
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS fecha_llegada_estimada DATE,
    ADD COLUMN IF NOT EXISTS fecha_rechazo TIMESTAMP,
    ADD COLUMN IF NOT EXISTS fecha_cancelacion TIMESTAMP;
ALTER TABLE detalle_salidas ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(12,2) DEFAULT 0;
ALTER TABLE detalle_salidas ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2) DEFAULT 0;
ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS superficie_m2 NUMERIC(12,2);
UPDATE almacenes SET superficie_m2 = 7280 WHERE superficie_m2 IS NULL;
ALTER TABLE almacenes ALTER COLUMN superficie_m2 SET DEFAULT 7280;
ALTER TABLE almacenes ALTER COLUMN superficie_m2 SET NOT NULL;

-- Crear tabla de notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
    id_notificacion SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(100) NOT NULL,
    mensaje TEXT NOT NULL,
    leida BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Limpiar datos y reiniciar IDs (Súper importante)
TRUNCATE TABLE 
    diferencias_recepcion, movimientos_inventario, ajustes_inventario, detalle_inventario_fisico, 
    inventarios_fisicos, detalle_transferencias, transferencias, notificaciones, detalle_salidas, 
    salidas_inventario, detalle_entradas, entradas_inventario, stock_ubicaciones, stock, 
    lotes_productos, ubicaciones, almacenes, productos, subcategorias, categorias, marcas, 
    unidades_medida, usuarios, roles
RESTART IDENTITY CASCADE;

-- 4. Insertar Datos (Roles, Usuarios, etc.)
INSERT INTO roles (nombre, descripcion) VALUES
('ADMINISTRADOR', 'Acceso total al sistema'),
('ENCARGADO_ALMACEN', 'Gestión de inventario'),
('SUPERVISOR', 'Supervisión'),
('CAJERO', 'Ventas'),
('AUDITOR', 'Auditoría'),
('GERENTE', 'Reportes');

INSERT INTO usuarios (id_rol, nombre_usuario, password_hash, nombre_completo, email) VALUES
(1, 'admin', crypt('Admin123*', gen_salt('bf')), 'Administrador del Sistema', 'admin@chuby.com'),
(2, 'encargado1', crypt('Admin123*', gen_salt('bf')), 'Juan Pérez', 'juan@chuby.com'),
(2, 'encargado2', crypt('Admin123*', gen_salt('bf')), 'María Gómez', 'maria@chuby.com'),
(3, 'supervisor1', crypt('Admin123*', gen_salt('bf')), 'Carlos Ruiz', 'carlos@chuby.com');

INSERT INTO unidades_medida (nombre, abreviatura) VALUES
('Unidad', 'UND'), ('Kilogramo', 'KG'), ('Litro', 'L'), ('Caja', 'CJA'), ('Paquete', 'PQT');

INSERT INTO categorias (nombre) VALUES
('Alimentos Secos'), ('Bebidas'), ('Lácteos'), ('Limpieza'), ('Cuidado Personal');

INSERT INTO subcategorias (id_categoria, nombre) VALUES
(1, 'Arroz y Granos'), (1, 'Pastas'), (2, 'Gaseosas'), (3, 'Leche'), (4, 'Detergentes');

INSERT INTO marcas (nombre) VALUES
('Coca Cola'), ('Pepsi'), ('Pil'), ('Nestlé'), ('Unilever'), ('Fino');

INSERT INTO almacenes (codigo, nombre, tipo, direccion, ciudad, capacidad, superficie_m2) VALUES
('ALM-CENT', 'Almacén Central', 'CENTRAL', 'Av. Principal 123', 'La Paz', 8000, 7280),
('SUC-NORTE', 'Sucursal Norte', 'SUCURSAL', 'Calle Falsa 456', 'El Alto', 800, 7280),
('SUC-SUR', 'Sucursal Sur', 'SUCURSAL', 'Av. Sur 789', 'La Paz', 50, 7280);

INSERT INTO ubicaciones (id_almacen, zona, pasillo, estante, nivel) VALUES
(1, 'A', 'P1', 'E1', 'N1'), (1, 'B', 'P2', 'E3', 'N1'), (2, 'A', 'P1', 'E1', 'N1');

INSERT INTO productos 
(codigo, codigo_barras, nombre, id_categoria, id_subcategoria, id_marca, id_unidad, controla_vencimiento, precio, stock_minimo, stock_maximo, punto_reposicion, estado) 
VALUES
('PROD-001', '750100000001', 'Arroz Extra 1kg', 1, 1, 5, 1, FALSE, 8.50, 20, 200, 50, 'ACTIVO'),
('PROD-002', '750100000002', 'Fideo Tallarín 500g', 1, 2, 5, 1, FALSE, 5.00, 30, 300, 80, 'ACTIVO'),
('PROD-003', '750100000003', 'Coca Cola 2L', 2, 3, 1, 1, TRUE, 12.00, 50, 500, 100, 'ACTIVO'),
('PROD-004', '750100000004', 'Pepsi 2L', 2, 3, 2, 1, TRUE, 11.00, 40, 400, 90, 'ACTIVO'),
('PROD-005', '750100000005', 'Leche Pil 1L', 3, 4, 3, 1, TRUE, 7.50, 60, 600, 150, 'ACTIVO');

-- 5. Lotes y Stock (Incluye lote vencido para probar RF27)
INSERT INTO lotes_productos (id_producto, id_almacen, numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_actual, estado) VALUES
(1, 1, 'LOTE-ARZ-01', CURRENT_DATE - INTERVAL '60 days', NULL, 100, 100, 'DISPONIBLE'),
(3, 1, 'LOTE-COCA-01', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '6 months', 200, 200, 'DISPONIBLE'),
(4, 1, 'LOTE-PEPSI-01', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '6 months', 150, 150, 'DISPONIBLE'),
(5, 1, 'LOTE-LECHE-01', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '5 days', 300, 300, 'DISPONIBLE'),
(1, 2, 'LOTE-ARZ-NORTE', CURRENT_DATE - INTERVAL '10 days', NULL, 40, 40, 'DISPONIBLE');

INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada) VALUES
(1, 1, 100, 5), (2, 1, 250, 0), (3, 1, 200, 10), (4, 1, 150, 0), (5, 1, 300, 20);

INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada) VALUES
(1, 2, 40, 0);

COMMIT;