# Pruebas de rendimiento — Sprint 4 (HT08)

**Objetivo:** las consultas y reportes principales deben responder en menos de
**3 segundos** con un volumen de datos realista.

## Entorno y volumen

| Elemento | Valor |
|---|---|
| Base de datos | PostgreSQL 16.8 local (Windows 10), base `hipermaxi_rendimiento` |
| Backend | Node.js 22.15, mismo código de la rama, sin Pub/Sub |
| Productos | 3.000 (60 inactivos) |
| Almacenes | 20 |
| Registros de stock | 60.000 |
| Lotes | 121.300 |
| Movimientos de inventario | 600.000 (un año) |
| Salidas | 40.000 |
| Recepciones | 3.000 (15.000 líneas) |
| Transferencias | 2.000 |
| Mensajes de integración | 50.000 |

Los datos se generan con `backend/scripts/rendimiento/generar-datos.sql` (≈ 40 s).

## Método

`backend/scripts/rendimiento/medir.js` llama a 17 consultas: una llamada previa
de calentamiento y luego 5 repeticiones. Se registra la mediana, el percentil 95 y
el máximo del tiempo total de la petición HTTP (consulta + serialización +
transferencia). Una consulta **cumple** si responde 200 y su p95 es menor a 3.000 ms.

## Resultados

Tiempo p95 en milisegundos.

| Consulta | Antes | Después | Cumple |
|---|---:|---:|:---:|
| Consulta de stock (página 1) | 21 | 15 | ✅ |
| Consulta de stock con búsqueda | 13 | 11 | ✅ |
| Historial de un producto | 10 | 6 | ✅ |
| Próximos vencimientos | 17 | 14 | ✅ |
| RF44 Existencias | **4.117** (35 MB) | 529 (65 KB) | ✅ |
| RF45 Movimientos (mes) | 305 | 322 | ✅ |
| RF45 Movimientos (año, por tipo) | 971 | 812 | ✅ |
| RF46 Pérdidas (año) | 106 | 126 | ✅ |
| RF62 Indicadores (mes) | 1.376 | 314 | ✅ |
| RF62 Indicadores (6 meses) | 1.531 | 866 | ✅ |
| RF63 Lotes por vencer | 319 | 149 | ✅ |
| RF64 Transferencias (año) | 1.312 | 1.351 | ✅ |
| RF65 Rotación (90 días) | 593 | 684 | ✅ |
| RF67 Comparativo con faltantes | 1.800 | 769 | ✅ |
| RF69 Cumplimiento de proveedores | **3.021** | 65 | ✅ |
| RF71 Valorización | **3.520** | 682 | ✅ |
| RF75 Métricas de integraciones | 17 | 17 | ✅ |

Antes de optimizar, 3 de 17 consultas superaban el límite. Después, las 17 cumplen;
la más lenta es el reporte de transferencias de un año (1,35 s).

## Optimizaciones realizadas

Migración `backend/migrations/20261119_ht08_optimizacion_consultas.sql`:

1. **Vista de existencias (`vw_reporte_existencias`).** Calculaba lo vencido y lo
   que está en cuarentena con dos funciones por cada fila de stock (120.000
   subconsultas). Se reemplazó por una única agregación de lotes con el mismo
   criterio. La consulta bajó de 1.318 ms a ~200 ms y se comprobó que las 60.000
   filas dan exactamente los mismos valores. Mejora también valorización,
   comparativo entre sucursales e indicadores, que usan esa vista.
2. **Índice `detalle_entradas (id_entrada)`.** El cumplimiento de proveedores leía
   todo el detalle de recepciones una vez por recepción: 3.021 ms → 65 ms.
3. **Índice `detalle_salidas (id_salida)`.** Para los reportes que unen salidas con
   su detalle.

En la aplicación:

4. **Existencias paginada.** El reporte devolvía todas las filas (35 MB con este
   volumen, lento también para el navegador). Ahora el detalle viene de a 100
   filas; los totales y los resúmenes siguen calculándose sobre todo el filtro, y
   **Exportar** pide todas las filas solo al momento de exportar.

## Cómo repetir la prueba

```bash
# 1. Base de pruebas con el esquema y las migraciones al día
createdb hipermaxi_rendimiento
psql -d hipermaxi_rendimiento -f <respaldo_del_esquema>.sql
DB_NAME=hipermaxi_rendimiento npm run migrate

# 2. Datos masivos
psql -d hipermaxi_rendimiento -f scripts/rendimiento/generar-datos.sql

# 3. Backend apuntando a esa base (otra terminal)
DB_NAME=hipermaxi_rendimiento PORT=3200 PUBSUB_TOPIC= npm start

# 4. Medición (termina con código 1 si alguna consulta no cumple)
node scripts/rendimiento/medir.js http://localhost:3200/api 5
```

> El script de datos borra productos, stock y movimientos: nunca se ejecuta sobre
> la base real.
