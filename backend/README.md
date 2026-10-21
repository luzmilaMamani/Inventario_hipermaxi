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

El script SQL crea este usuario inicial para pruebas:

```json
{
  "nombre_usuario": "admin",
  "password": "<configurar según el seed local>"
}
```

Las cuentas de prueba adicionales creadas en la base local son:

| Rol | Usuario |
|---|---|
| ENCARGADO_ALMACEN | `encargado_almacen` |IjxQfHtAmHECciqkvRtaRDdq
| SUPERVISOR | `supervisor` |R2d1eJPJ_eG-ySolkLPdKfoZ
| EMPLEADO | `empleado` |LJjw4JUcYNLUcXFHQ8YD9dMt
| GERENTE | `gerente` |lBxTEgD-uUnnKHQE3Wc45bBD
| AUDITOR | `auditor` |r7xv8HXOPv-dfbNYuoo4E8L5

Las contraseñas temporales se entregaron durante la sesión de desarrollo y no se guardan en este README para evitar incluir credenciales en el repositorio. Cámbialas antes de usar estas cuentas fuera de pruebas locales.

## Permisos por rol

- `ADMINISTRADOR`: acceso completo.
- `ENCARGADO_ALMACEN`: operaciones de inventario, transferencias y ajustes; consulta de los catálogos, sin modificarlos.
- `EMPLEADO`: captura de recepciones, salidas, solicitudes de transferencia, conteos y recepción de transferencias; solo lectura en el resto.
- `SUPERVISOR`, `GERENTE` y `AUDITOR`: solo consultas.

Los permisos se verifican en la API; ocultar acciones en la interfaz no reemplaza la autorización del servidor.

Petición:

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
- `PUT /api/transferencias/:id/estado` (aprobar o rechazar solicitudes solo para `ENCARGADO_ALMACEN` y `ADMINISTRADOR`; marcar como enviada requiere `fecha_llegada_estimada` en formato `YYYY-MM-DD`)
- `GET /api/transferencias` y `GET /api/transferencias/:id` incluyen fechas y datos del recorrido
- `GET /api/reportes/perdidas` (reporte de pérdidas con filtros por fecha, almacén y subtipo)

Las recepciones crean automáticamente un lote por línea si no se proporciona un lote existente. Se puede enviar `numero_lote` y `fecha_vencimiento` en cada detalle.

Para instalaciones existentes, ejecutar `migrations/20261021_add_transferencia_tracking_fields.sql` para agregar la fecha estimada de llegada y las fechas de rechazo/cancelación.

Ejecutar `migrations/20261021_create_required_views.sql` para instalar las vistas de reportes de pérdidas, daños y vencimientos, además de la vista de consulta de transferencias.

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
