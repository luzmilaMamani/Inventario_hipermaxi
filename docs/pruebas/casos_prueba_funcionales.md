# Casos de prueba funcionales del frontend — Sprint 4 (HT06)

Pruebas desde la vista del usuario sobre los flujos completos del sistema.
Cada caso se ejecuta en el navegador con el rol indicado y se comprueba también el
efecto en los datos (stock, movimientos, estados).

- **Entorno:** frontend (Vite) + backend apuntando a una base de pruebas con 6 meses
  de operación simulada (30 productos, 3 almacenes, lotes vigentes, vencidos y por
  vencer, recepciones con diferencias, transferencias y ventas).
- **Resultado:** ✅ Pasa · ❌ Falla (se registra como Error en Jira) · ⚠️ Pasa con
  observación.
- Los resultados de la ejecución están en
  [resultados_pruebas_funcionales.md](resultados_pruebas_funcionales.md).

## 1. Recepción de mercadería (RF20–RF22)

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| REC-01 | Recepción conforme | Encargado de almacén | Movimientos › Recepciones › Nueva. Elegir almacén, proveedor, un producto sin vencimiento con esperada = recibida = 20. Guardar. | Mensaje "Recepción … registrada. La verificación quedó conforme." |
| REC-02 | Recepción con diferencia | Encargado de almacén | Igual que REC-01 con esperada 20 y recibida 17. | Mensaje "…con diferencia en 1 línea". La recepción aparece en RF69 con faltante de 3. |
| REC-03 | No recibir un producto vencido | Encargado de almacén | Producto que controla vencimiento con fecha de vencimiento de hoy. Guardar. | Error "…debe ser posterior a hoy; no se puede recibir un producto vencido." No se registra nada. |
| REC-04 | Confirmar recepción actualiza el stock | Encargado de almacén | Abrir la recepción de REC-01 y pulsar **Confirmar recepción**. | La recepción queda confirmada y el stock del producto en ese almacén sube 20. |

## 2. Salidas de mercadería (RF25–RF27, RF49)

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| SAL-01 | Venta con FEFO | Encargado de almacén | Movimientos › Salidas › Registrar salida. Motivo Venta, producto con lotes, cantidad 3. Agregar y registrar. | La salida se registra; el stock baja 3; el movimiento sale del lote que vence antes. |
| SAL-02 | Pérdida con subtipo | Encargado de almacén | Motivo Pérdida, subtipo Robo, cantidad 1. | La pérdida aparece en Reportes › Pérdidas con tipo Pérdida y motivo Robo, valorizada. |
| SAL-03 | Salida mayor al disponible | Encargado de almacén | Motivo Venta, cantidad mayor al stock disponible. | Se muestra un error de stock insuficiente y el stock no cambia. |

## 3. Transferencias entre almacenes (RF29–RF32, RF57, RF58)

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| TRF-01 | Solicitar transferencia | Encargado de almacén | Movimientos › Transferencias › Nueva. Origen Almacén Central, destino Sucursal Sur, un producto, 5 unidades. | La transferencia queda SOLICITADA en la lista. |
| TRF-02 | Aprobar, enviar y recibir completa | Administrador | Aprobar la de TRF-01, Registrar envío con fecha estimada, Registrar recepción con lo enviado. | Estado RECIBIDA; el stock baja en origen y sube en destino; aparece en Reportes › Transferencias con su tiempo de entrega. |
| TRF-03 | Recibir con diferencia | Administrador | Repetir con otra transferencia y recibir 1 unidad menos, con observación. | Estado RECIBIDA_CON_DIFERENCIAS y diferencia −1 en el reporte. |
| TRF-04 | Solicitar desde el comparativo | Encargado de almacén | Reportes › Comparativo sucursales › **Solicitar** en una sugerencia. | Se abre el formulario con origen, destino, producto y cantidad precargados; al guardar queda SOLICITADA. |

## 4. Inventario físico (RF33–RF35)

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| INV-01 | Programar un inventario | Encargado de almacén | Stock › Inventarios físicos › Nuevo. Almacén y fecha. | El inventario aparece en la lista. |
| INV-02 | Registrar conteo con diferencia | Encargado de almacén | Abrir el inventario, contar un producto con 2 unidades menos que el sistema. | El conteo se guarda y la pantalla de diferencias muestra −2 para ese producto. |

## 5. Reportes e indicadores (RF44–RF46, RF62–RF65, RF67, RF69–RF71, RF75)

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| REP-01 | Tablero de indicadores | Gerente | Reportes › Indicadores. Cambiar el período a 90 días. Clic en "Tasa de merma". | Se ven los 7 KPIs y los gráficos; el clic abre Reportes › Pérdidas. |
| REP-02 | Existencias con filtros | Gerente | Reportes › Existencias. Filtrar por almacén. | Totales por almacén y categoría coinciden con el detalle; paginación visible si hay más de 100 filas. |
| REP-03 | Movimientos por tipo | Auditor | Reportes › Movimientos. Clic en la tarjeta "Ajustes". | Solo se listan ajustes y el total coincide con la tarjeta. |
| REP-04 | Pérdidas consolidadas | Gerente | Reportes › Pérdidas. Filtrar tipo Daño. | Solo daños; la tabla por motivo muestra solo motivos de daño. |
| REP-05 | Lotes por vencer | Supervisor | Reportes › Lotes por vencer, rango 7 días. | Los vencidos se ven separados y ningún "por vencer" pasa de 7 días. |
| REP-06 | Transferencias por ruta | Gerente | Reportes › Transferencias. | Se ve el tiempo promedio por ruta y las transferencias tarde marcadas. |
| REP-07 | Rotación | Gerente | Reportes › Rotación. Clic en "Baja rotación". | Solo productos de baja rotación, con días de inventario. |
| REP-08 | Comparativo sin permiso de transferir | Gerente | Reportes › Comparativo sucursales. | Se ven las sugerencias pero **no** el botón Solicitar. |
| REP-09 | Cumplimiento de proveedores | Encargado de almacén | Reportes › Proveedores. Clic en un proveedor. | El detalle se filtra a ese proveedor. |
| REP-10 | Valorización | Gerente | Reportes › Valorización. Desplegar un almacén. | El desglose por categoría suma el total del almacén. |
| REP-11 | Integraciones y reproceso | Administrador | Reportes › Integraciones. Reprocesar un mensaje con error. | Mensaje del resultado y la lista se actualiza. |
| REP-12 | Programar envío por correo | Gerente | Reportes › Envío por correo › Nueva programación (semanal). | La programación aparece con su próximo envío; "Enviar ahora" deja registro en la bitácora. |
| REP-13 | Exportar | Gerente | En Existencias pulsar **Exportar Excel**. | Se descarga un CSV con todas las filas del filtro. |

## 6. Permisos y navegación

| ID | Caso | Rol | Pasos | Resultado esperado |
|---|---|---|---|---|
| PER-01 | Solo lectura | Auditor | Intentar registrar una salida. | No se muestra el botón "Registrar salida". |
| PER-02 | Envío por correo restringido | Supervisor | Abrir el menú Reportes. | No aparece "Envío por correo". |
| PER-03 | Vista en celular | Gerente | Abrir Indicadores y Existencias a 390 px de ancho. | Sin desplazamiento horizontal de la página. |
