# Pruebas extremo a extremo con el SI de Ventas — Sprint 4 (HIP-275)

Flujo asíncrono de RF72 probado con **Google Pub/Sub real**: los mensajes se
publican en el tópico del grupo (`ucb-sis323-sub-i`) y el backend los recibe por la
suscripción exclusiva de Inventario
(`projects/inventario-hipermaxi/subscriptions/inventario-ventas`).

- **Fecha:** 25/11/2026
- **Entorno:** backend Node.js 22 sobre una copia temporal de la base de datos
  (se elimina al terminar), con un producto de prueba de 20 unidades en un lote.
- **Rama:** `jhona`.

## Resultados

| ID | Caso | Resultado | Detalle |
|---|---|:---:|---|
| VEN-E2E-01 | Inventario apagado: el mensaje espera en la suscripción | ✅ | Tras 8 s sin suscriptor no hay registro y el stock sigue en 20 |
| VEN-E2E-02 | Inventario vuelve: procesa lo pendiente | ✅ | Estado PROCESADO; stock 20 → 18 |
| VEN-E2E-03 | Mensaje duplicado no descuenta dos veces | ✅ | Dos publicaciones del mismo `id_mensaje`; stock 18 → 15 (una sola salida) |
| VEN-E2E-04 | Venta anulada devuelve el stock | ✅ | Estado PROCESADO; stock 15 → 18; movimiento `ANULACION_VENTA` |
| VEN-E2E-05 | Sin stock: queda con error y no descuenta | ✅ | Estado ERROR con el motivo "Stock insuficiente"; stock sin cambios |
| VEN-E2E-06 | El mensaje con error se puede reprocesar | ✅ | Tras reponer stock y reprocesar, la venta queda DESCONTADA |
| VEN-E2E-07 | Producto inexistente: queda con error | ✅ | Estado ERROR "Producto inexistente o inactivo" |

**Resultado: 7 de 7 casos aprobados.**

## Mensajes que fallan una y otra vez (dead-letter)

La suscripción tiene una política de dead-letter: después de 10 intentos de entrega
fallidos (por ejemplo, si la base de datos no responde), el mensaje pasa al tópico
`inventario-ventas-dlq` y se puede revisar en la suscripción
`inventario-ventas-dlq-sub`, las dos en el proyecto `inventario-hipermaxi`. Los
errores de negocio (sin stock, producto inexistente) no llegan ahí: se confirman,
quedan con estado ERROR y se reprocesan desde **Reportes › Integraciones**.

## Cómo repetir las pruebas

Con `PUBSUB_SUBSCRIPTION` configurada y el backend levantado, desde `backend`:

```bash
node scripts/simular-ventas.js confirmada V-1001 ALM-001 PRD-001:2   # descuenta
node scripts/simular-ventas.js anulada V-1001 ALM-001                # devuelve
```

Para la caída, detener el backend, publicar una venta, comprobar que el stock no
cambia y volver a levantarlo: la venta se procesa al reconectarse. Sin Pub/Sub, el
mismo JSON se puede enviar a `POST /api/ventas/simular`.
