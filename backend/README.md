# Backend Chuby Hipermaxi

API REST en Node.js + Express para PostgreSQL con autenticacion JWT.

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Copia `.env.example` como `.env` y ajusta tus datos de PostgreSQL:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Inicia el servidor:

```bash
npm run dev
```

La API queda disponible en:

```text
http://localhost:3000
```

## Login

El script SQL crea este usuario inicial:

```json
{
  "nombre_usuario": "admin",
  "password": "Admin123*"
}
```

Peticion:

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "nombre_usuario": "admin",
  "password": "Admin123*"
}
```

Usa el token recibido en las rutas protegidas:

```http
Authorization: Bearer TU_TOKEN
```

## Rutas principales

Todas estas rutas tienen CRUD basico: `GET`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`.

- `/api/roles`
- `/api/usuarios`
- `/api/categorias`
- `/api/subcategorias`
- `/api/marcas`
- `/api/unidades-medida`
- `/api/productos`
- `/api/almacenes`
- `/api/ubicaciones`
- `/api/lotes-productos`
- `/api/stock`
- `/api/stock-ubicaciones`
- `/api/entradas-inventario`
- `/api/detalle-entradas`
- `/api/salidas-inventario`
- `/api/detalle-salidas`
- `/api/transferencias`
- `/api/detalle-transferencias`
- `/api/inventarios-fisicos`
- `/api/detalle-inventario-fisico`
- `/api/ajustes-inventario`
- `/api/movimientos-inventario`
- `/api/integraciones`
- `/api/logs-integracion`
- `/api/referencias-externas`

## Rutas especiales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/register` solo para rol `ADMINISTRADOR`
- `PUT /api/auth/change-password`
- `GET /api/reportes/productos-proximo-vencimiento`
- `GET /api/reportes/lotes-proximos-vencer`
- `GET /api/reportes/stock-bajo`
- `GET /api/stock/historial/:id_producto` (historial paginado de movimientos)
- `POST /api/entradas-inventario` (recepción de proveedor; registra entrada, detalle, stock y movimientos en una transacción)
- `GET /api/salidas` y `GET /api/salidas/:id` (consulta de salidas)
- `POST /api/salidas` (registra la salida, descuenta existencias y crea un movimiento trazable por producto; selecciona el lote disponible con vencimiento más próximo)
- `PUT /api/transferencias/:id/estado` (aprobar o rechazar solicitudes solo para `ENCARGADO_ALMACEN` y `ADMINISTRADOR`)
- `GET /api/reportes/perdidas` (reporte de pérdidas con filtros por fecha, almacén y subtipo)

Las recepciones crean automáticamente un lote por línea si no se proporciona un lote existente. Se puede enviar `numero_lote` y `fecha_vencimiento` en cada detalle.

## Filtros y paginacion

### Precio de productos

Para guardar precios en productos existentes, ejecutar una vez en PostgreSQL:

```sql
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS precio NUMERIC(12, 2) NOT NULL DEFAULT 0;
```

El mismo cambio está disponible en `migrations/20261016_add_precio_productos.sql`.
Los productos existentes comienzan con precio `0`; actualiza sus precios desde
el formulario de productos. El precio queda guardado en cada detalle de salida
al registrarla, para conservar el valor usado en ese momento.

Ejemplo:

```http
GET /api/productos?page=1&limit=20&estado=ACTIVO&orderBy=nombre&order=ASC
```
