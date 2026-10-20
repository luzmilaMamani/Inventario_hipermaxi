/* ============================================================
   SCRIPT DE DATOS DE PRUEBA (SEED)
   CHUBY HIPERMAXI
   
   ¡ADVERTENCIA! Este script borra TODOS los datos existentes
   de las tablas operativas y reinicia los IDs.
   ============================================================ */

BEGIN;

-- 1. Borrar datos existentes (respetando el orden de las llaves foráneas)
TRUNCATE TABLE 
    diferencias_recepcion,
    movimientos_inventario,
    ajustes_inventario,
    detalle_inventario_fisico,
    inventarios_fisicos,
    detalle_transferencias,
    transferencias,
    detalle_salidas,
    salidas_inventario,
    detalle_entradas,
    entradas_inventario,
    stock_ubicaciones,
    stock,
    lotes_productos,
    ubicaciones,
    almacenes,
    productos,
    subcategorias,
    categorias,
    marcas,
    unidades_medida,
    usuarios,
    roles
RESTART IDENTITY CASCADE;

-- 2. Insertar Roles
INSERT INTO roles (nombre, descripcion) VALUES
('ADMINISTRADOR', 'Acceso total al sistema'),
('ENCARGADO_ALMACEN', 'Gestión de inventario y recepciones'),
('SUPERVISOR', 'Supervisión de inventarios y ajustes'),
('CAJERO', 'Registro de ventas'),
('AUDITOR', 'Solo lectura y auditoría'),
('GERENTE', 'Acceso a reportes');

-- 3. Insertar Usuarios (Contraseña para todos: Admin123*)
INSERT INTO usuarios (id_rol, nombre_usuario, password_hash, nombre_completo, email) VALUES
(1, 'admin', crypt('Admin123*', gen_salt('bf')), 'Administrador del Sistema', 'admin@chuby.com'),
(2, 'encargado1', crypt('Admin123*', gen_salt('bf')), 'Juan Pérez', 'juan@chuby.com'),
(2, 'encargado2', crypt('Admin123*', gen_salt('bf')), 'María Gómez', 'maria@chuby.com'),
(3, 'supervisor1', crypt('Admin123*', gen_salt('bf')), 'Carlos Ruiz', 'carlos@chuby.com'),
(4, 'cajero1', crypt('Admin123*', gen_salt('bf')), 'Ana López', 'ana@chuby.com'),
(6, 'gerente1', crypt('Admin123*', gen_salt('bf')), 'Luis Fernández', 'luis@chuby.com');

-- 4. Insertar Unidades de Medida
INSERT INTO unidades_medida (nombre, abreviatura) VALUES
('Unidad', 'UND'), ('Kilogramo', 'KG'), ('Litro', 'L'), 
('Caja', 'CJA'), ('Paquete', 'PQT'), ('Docena', 'DOC'), ('Metro', 'M');

-- 5. Insertar Categorías
INSERT INTO categorias (nombre, descripcion) VALUES
('Alimentos Secos', 'Arroz, fideos, azúcar, etc.'),
('Bebidas', 'Gaseosas, jugos, aguas.'),
('Lácteos', 'Leche, yogur, quesos.'),
('Limpieza', 'Detergentes, jabones.'),
('Cuidado Personal', 'Shampoo, pasta dental.'),
('Carnes', 'Pollo, res, cerdo.'),
('Verduras', 'Frutas y verduras frescas.');

-- 6. Insertar Subcategorías
INSERT INTO subcategorias (id_categoria, nombre) VALUES
(1, 'Arroz y Granos'), (1, 'Pastas'), (2, 'Gaseosas'), (2, 'Jugos'),
(3, 'Leche'), (3, 'Yogures'), (4, 'Detergentes'), (5, 'Cuidado Capilar'),
(6, 'Pollo'), (7, 'Tubérculos');

-- 7. Insertar Marcas
INSERT INTO marcas (nombre) VALUES
('Coca Cola'), ('Pepsi'), ('Pil'), ('Nestlé'), ('Unilever'), 
('Fino'), ('Sofia'), ('La Rosa');

-- 8. Insertar Almacenes
INSERT INTO almacenes (codigo, nombre, tipo, direccion, ciudad, capacidad) VALUES
('ALM-CENT', 'Almacén Central', 'CENTRAL', 'Av. Principal 123', 'La Paz', 50000),
('SUC-NORTE', 'Sucursal Norte', 'SUCURSAL', 'Calle Falsa 456', 'El Alto', 10000),
('SUC-SUR', 'Sucursal Sur', 'SUCURSAL', 'Av. Sur 789', 'La Paz', 8000),
('DEPOSITO-1', 'Depósito Temporal', 'DEPOSITO', 'Zona Industrial', 'La Paz', 20000);

-- 9. Insertar Ubicaciones (para el Almacén Central)
INSERT INTO ubicaciones (id_almacen, zona, pasillo, estante, nivel) VALUES
(1, 'A', 'P1', 'E1', 'N1'),
(1, 'A', 'P1', 'E1', 'N2'),
(1, 'B', 'P2', 'E3', 'N1'),
(1, 'B', 'P2', 'E3', 'N2'),
(1, 'C', 'P3', 'E2', 'N1'),
(2, 'A', 'P1', 'E1', 'N1'),
(3, 'A', 'P1', 'E1', 'N1');

-- 10. Insertar Productos (7+ productos variados)
INSERT INTO productos 
(codigo, codigo_barras, nombre, id_categoria, id_subcategoria, id_marca, id_unidad, controla_vencimiento, precio, stock_minimo, stock_maximo, punto_reposicion, estado) 
VALUES
('PROD-001', '750100000001', 'Arroz Extra 1kg', 1, 1, 5, 2, FALSE, 8.50, 20, 200, 50, 'ACTIVO'),
('PROD-002', '750100000002', 'Fideo Tallarín 500g', 1, 2, 5, 1, FALSE, 5.00, 30, 300, 80, 'ACTIVO'),
('PROD-003', '750100000003', 'Coca Cola 2L', 2, 3, 1, 3, TRUE, 12.00, 50, 500, 100, 'ACTIVO'),
('PROD-004', '750100000004', 'Pepsi 2L', 2, 3, 2, 3, TRUE, 11.00, 40, 400, 90, 'ACTIVO'),
('PROD-005', '750100000005', 'Leche Pil 1L', 3, 5, 3, 3, TRUE, 7.50, 60, 600, 150, 'ACTIVO'),
('PROD-006', '750100000006', 'Yogur Griego 1L', 3, 6, 3, 1, TRUE, 15.00, 15, 150, 30, 'ACTIVO'),
('PROD-007', '750100000007', 'Detergente Omo 3kg', 4, 7, 5, 5, FALSE, 45.00, 10, 100, 25, 'ACTIVO'),
('PROD-008', '750100000008', 'Shampoo Sedal 400ml', 5, 8, 5, 1, FALSE, 22.00, 25, 200, 50, 'ACTIVO');

-- 11. Insertar Lotes y Stock en el Almacén Central (ID 1)
INSERT INTO lotes_productos (id_producto, id_almacen, numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_actual, estado) VALUES
(1, 1, 'LOTE-ARZ-01', CURRENT_DATE, NULL, 100, 100, 'DISPONIBLE'),
(3, 1, 'LOTE-COCA-01', CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 200, 200, 'DISPONIBLE'),
(4, 1, 'LOTE-PEPSI-01', CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 150, 150, 'DISPONIBLE'),
(5, 1, 'LOTE-LECHE-01', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', 300, 300, 'DISPONIBLE'),
(7, 1, 'LOTE-OMO-01', CURRENT_DATE, NULL, 50, 50, 'DISPONIBLE');

INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada) VALUES
(1, 1, 100, 5),  -- Arroz: 100 en stock, 5 reservados
(2, 1, 250, 0),  -- Fideo
(3, 1, 200, 10), -- Coca Cola
(4, 1, 150, 0),  -- Pepsi
(5, 1, 300, 20), -- Leche
(6, 1, 80, 0),   -- Yogur
(7, 1, 50, 0),   -- Detergente
(8, 1, 120, 0);  -- Shampoo

-- 12. Insertar Stock en Sucursal Norte (ID 2)
INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada) VALUES
(1, 2, 40, 0),
(3, 2, 80, 0),
(5, 2, 60, 5);

-- 13. Insertar Stock en Ubicaciones (para probar la tarea de ubicaciones)
INSERT INTO stock_ubicaciones (id_producto, id_ubicacion, cantidad) VALUES
(1, 1, 50), -- Arroz en Zona A, P1
(3, 2, 100), -- Coca Cola en Zona A, P1 N2
(5, 4, 150); -- Leche en Zona B

COMMIT;