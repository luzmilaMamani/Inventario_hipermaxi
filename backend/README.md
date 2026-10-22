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

## Actualizar la base de datos

Configura la conexión PostgreSQL en `backend/.env`. Desde la carpeta `backend`,
ejecuta:

```bash
npm run migrate
```

El comando aplica en orden las migraciones versionadas pendientes de
`migrations/` y registra las ya aplicadas en `schema_migrations`. La base de
datos debe existir y tener el esquema inicial del sistema. Este comando no crea
la base ni carga datos de prueba.

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
- `POST /api/reportes/stock-bajo/publicar` (publica en Google Pub/Sub todos los productos que cumplen la alerta de stock bajo)

### Publicar inventario con stock bajo en Google Pub/Sub

Configura `PUBSUB_TOPIC` en `backend/.env` con el nombre completo del topic.
Para autenticar localmente, configura Application Default Credentials de Google
Cloud o define `GOOGLE_APPLICATION_CREDENTIALS` con la ruta local al JSON de
una cuenta de servicio autorizada para publicar en ese topic. No subas el JSON
de credenciales al repositorio.

Con el backend iniciado, llama a `POST /api/reportes/stock-bajo/publicar` con
el token de un usuario autorizado. El backend vuelve a consultar el inventario
en ese momento, crea un único mensaje JSON con todos los productos bajo el
mínimo o punto de reposición, e incluye sus lotes disponibles. La respuesta
incluye el ID que devuelve Pub/Sub. No se publica un mensaje vacío si no hay
productos con stock bajo.

```http
POST /api/reportes/stock-bajo/publicar
Authorization: Bearer <token>
```

#### Alertas automáticas (integración asíncrona)

Además del envío manual, cada vez que un movimiento (venta, salida,
transferencia, ajuste, etc.) deja el stock de un producto en un almacén igual o
por debajo del stock mínimo o del punto de reposición, el trigger `trg_stock_bajo`
registra un evento en la tabla `eventos_stock_bajo` y avisa por `NOTIFY stock_bajo`.
Al iniciar, el backend escucha ese canal y publica un mensaje por evento en el
topic (`tipo_evento: "STOCK_BAJO"`, con el producto, el almacén, la cantidad
anterior/resultante y los lotes disponibles). Los atributos del mensaje incluyen
`id_evento`, `id_producto` e `id_almacen`.

Como los eventos quedan guardados en la base, si Pub/Sub o el backend no
están disponibles se publican después: los pendientes y fallidos se reintentan
cada minuto (hasta 10 intentos). Revisa el estado con:

```sql
SELECT id_evento, estado, intentos, message_id, ultimo_error
FROM eventos_stock_bajo ORDER BY id_evento DESC;
```

Las recepciones crean automáticamente un lote por línea si no se proporciona un lote existente. Se puede enviar `numero_lote` y `fecha_vencimiento` en cada detalle.

Las migraciones para instalaciones existentes agregan la fecha estimada de
llegada y las fechas de rechazo/cancelación, además de las vistas de reportes.
Ejecuta `npm run migrate` para aplicarlas.

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
