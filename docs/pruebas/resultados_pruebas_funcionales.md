# Resultados de las pruebas funcionales — Sprint 4 (HT06)

Ejecución de los casos de [casos_prueba_funcionales.md](casos_prueba_funcionales.md)
con el arnés automático de [`frontend/pruebas-e2e`](../../frontend/pruebas-e2e/README.md):
cada caso se recorre en Chrome con el rol indicado y su efecto se comprueba en los
datos (stock, estados, reportes).

- **Fecha:** 18/11/2026
- **Entorno:** frontend Vite + backend Node.js 22 sobre una base de pruebas con 6
  meses de operación simulada (30 productos, 3 almacenes).
- **Rama:** `jhona` (sistema completo del Sprint 4).

## Primera ejecución (antes de las correcciones)

| ID | Caso | Rol | Resultado | Detalle |
|---|---|---|:---:|---|
| REC-01 | Recepción conforme | Encargado de almacén | ✅ | Recepción ENT-1795016054208-acaf6b conforme |
| REC-02 | Recepción con diferencia | Encargado de almacén | ✅ | Diferencia de 3 visible en RF69 |
| REC-03 | No recibir un producto vencido | Encargado de almacén | ✅ | Bloqueado con el mensaje esperado |
| REC-04 | Confirmar recepción actualiza el stock | Encargado de almacén | ✅ | Stock 82 → 102 |
| SAL-01 | Venta con FEFO | Encargado de almacén | ✅ | Stock 167 → 164 |
| SAL-02 | Pérdida con subtipo en el reporte RF46 | Encargado de almacén | ✅ | PER-2026-0014 valorizada en Bs 8.69 |
| SAL-03 | Salida mayor al disponible | Encargado de almacén | ✅ | Error de stock insuficiente y stock sin cambios |
| TRF-01 | Solicitar transferencia | Encargado de almacén | ✅ | TRF-2026-0037 SOLICITADA |
| TRF-02 | Aprobar, enviar y recibir completa | Administrador | ✅ | RECIBIDA; origen 130→125, destino 12→17; entrega 0.0 h |
| TRF-03 | Recibir con diferencia | Administrador | ✅ | TRF-2026-0038 RECIBIDA_CON_DIFERENCIAS (−1) |
| TRF-04 | Solicitar desde el comparativo | Encargado de almacén | ✅ | TRF-2026-0039 Almacén Central → Sucursal Sur |
| TRF-05 | Mensaje de confirmación al aprobar | Administrador | ❌ | Al aprobar se pregunta: "¿Confirmas registrar la entrada al almacén?" |
| INV-01 | Programar un inventario | Encargado de almacén | ✅ | INV-1795016155923 PROGRAMADO |
| INV-02 | Registrar conteo con diferencia | Encargado de almacén | ❌ | La pantalla de diferencias no muestra −2 |
| REP-01 | Tablero de indicadores | Gerente | ✅ | 7 KPIs; el clic en merma abre Pérdidas |
| REP-02 | Existencias con filtros | Gerente | ✅ | Detalle = categorías = resumen = Bs 137310.82 |
| REP-03 | Movimientos por tipo | Auditor | ✅ | 19 filas, todas ajustes |
| REP-04 | Pérdidas consolidadas por tipo | Gerente | ✅ | Motivos: Todos, Inutilizable, Deterioro, Roto |
| REP-05 | Lotes por vencer (7 días) | Supervisor | ✅ | 13 vencidos y 11 por vencer en 7 días |
| REP-06 | Transferencias por ruta | Gerente | ✅ | Rutas y transferencias tarde marcadas |
| REP-07 | Rotación: baja rotación | Gerente | ✅ | 9 productos de baja rotación |
| REP-08 | Comparativo sin permiso de transferir | Gerente | ✅ | Sugerencias visibles, sin botón Solicitar |
| REP-09 | Cumplimiento de proveedores | Encargado de almacén | ✅ | Detalle filtrado a Proveedor E2E Faltante mwma7l62 |
| REP-10 | Valorización por almacén y categoría | Gerente | ✅ | El desglose por categoría suma el total de cada almacén |
| REP-11 | Integraciones y reproceso | Administrador | ✅ | El mensaje sigue INVALIDO |
| REP-12 | Programar envío por correo | Gerente | ✅ | Creada y enviada; registrada en la bitácora |
| REP-13 | Exportar existencias a Excel | Gerente | ✅ | CSV de 7007 bytes |
| PER-01 | Auditor no registra salidas | Auditor | ✅ | Sin botón de registro |
| PER-02 | Supervisor sin Envío por correo | Supervisor | ✅ | No aparece en el menú |
| PER-03 | Vista en celular | Gerente | ✅ | scrollWidth 390 / 390 px |

**28 de 30 casos pasan.** Errores de JavaScript en consola: 0.

## Errores encontrados

Se registran en Jira como tipo **Error** y se corrigen en HT07.

### BUG-01 · Al aprobar una transferencia se pide confirmar una "entrada al almacén" (TRF-05)

- **Módulo:** Movimientos › Transferencias (frontend).
- **Pasos:** con una transferencia SOLICITADA, pulsar **Aprobar**.
- **Resultado obtenido:** el diálogo pregunta "¿Confirmas registrar la entrada al
  almacén?". Ese texto corresponde a la recepción; la aprobación no mueve stock.
- **Resultado esperado:** "¿Confirmas aprobar la transferencia?" (y "rechazar" al
  rechazar).
- **Severidad:** media; el usuario puede creer que la mercadería ya ingresó.

### BUG-02 · No se puede registrar el primer conteo de un inventario físico (INV-02)

- **Módulo:** Stock › Inventarios físicos › Conteo (backend).
- **Pasos:** planificar un inventario, abrirlo, elegir un producto, ingresar la
  cantidad física y pulsar **+ Agregar**.
- **Resultado obtenido:** "Valor inválido según las reglas del sistema" y no se
  guarda el conteo. El registro intenta pasar el inventario al estado `EN_CONTEO`,
  que la restricción `chk_inventario_estado` de la base de datos no admite (los
  estados válidos son `PROGRAMADO`, `EN_PROCESO`, `FINALIZADO` y `CANCELADO`).
- **Resultado esperado:** el conteo se guarda y el inventario pasa a `EN_PROCESO`.
- **Severidad:** alta; impide usar el inventario físico (RF35 y RF36).

## Observaciones (no son errores del sistema)

- En la base local, los nombres de algunos usuarios aparecen como
  "Encargado de Almac?n": el dato se guardó con una codificación incorrecta. Se
  corrige editando el usuario, no el código.
- En TRF-02 el tiempo de entrega es 0 h porque la prueba envía y recibe en el
  mismo minuto.

## Regresión después de las correcciones (HT07)

| Error | Corrección | Commit |
|---|---|---|
| BUG-01 | La confirmación dice lo que hace cada cambio de estado: aprobar, rechazar, salida o entrada al almacén. | `fix(HT07,HIP-253)` |
| BUG-02 | El primer conteo pasa el inventario a `EN_PROCESO`, el estado que admite la base de datos. | `fix(RF35)` |

Se volvió a cargar la base de pruebas y se ejecutaron **todos** los casos, no solo
los que fallaron, para descartar efectos secundarios. Además:

- Pruebas unitarias del backend: 63 de 63 pasan; cobertura de líneas de la capa
  de servicios: 97 %.
- Compilación del frontend y lint sin errores.

| ID | Caso | Rol | Resultado | Detalle |
|---|---|---|:---:|---|
| REC-01 | Recepción conforme | Encargado de almacén | ✅ | Recepción ENT-1795032820931-8ddc63 conforme |
| REC-02 | Recepción con diferencia | Encargado de almacén | ✅ | Diferencia de 3 visible en RF69 |
| REC-03 | No recibir un producto vencido | Encargado de almacén | ✅ | Bloqueado con el mensaje esperado |
| REC-04 | Confirmar recepción actualiza el stock | Encargado de almacén | ✅ | Stock 82 → 102 |
| SAL-01 | Venta con FEFO | Encargado de almacén | ✅ | Stock 167 → 164 |
| SAL-02 | Pérdida con subtipo en el reporte RF46 | Encargado de almacén | ✅ | PER-2026-0014 valorizada en Bs 8.69 |
| SAL-03 | Salida mayor al disponible | Encargado de almacén | ✅ | Error de stock insuficiente y stock sin cambios |
| TRF-01 | Solicitar transferencia | Encargado de almacén | ✅ | TRF-2026-0037 SOLICITADA |
| TRF-02 | Aprobar, enviar y recibir completa | Administrador | ✅ | RECIBIDA; origen 130→125, destino 12→17; entrega 0.0 h |
| TRF-03 | Recibir con diferencia | Administrador | ✅ | TRF-2026-0038 RECIBIDA_CON_DIFERENCIAS (−1) |
| TRF-04 | Solicitar desde el comparativo | Encargado de almacén | ✅ | TRF-2026-0039 Almacén Central → Sucursal Sur |
| TRF-05 | Mensaje de confirmación al aprobar | Administrador | ✅ | Pregunta: "¿Confirmas aprobar la transferencia?" |
| INV-01 | Programar un inventario | Encargado de almacén | ✅ | INV-1795032922435 PROGRAMADO |
| INV-02 | Registrar conteo con diferencia | Encargado de almacén | ✅ | Sistema 190, físico 188, diferencia −2 |
| REP-01 | Tablero de indicadores | Gerente | ✅ | 7 KPIs; el clic en merma abre Pérdidas |
| REP-02 | Existencias con filtros | Gerente | ✅ | Detalle = categorías = resumen = Bs 137310.82 |
| REP-03 | Movimientos por tipo | Auditor | ✅ | 19 filas, todas ajustes |
| REP-04 | Pérdidas consolidadas por tipo | Gerente | ✅ | Motivos: Todos, Inutilizable, Deterioro, Roto |
| REP-05 | Lotes por vencer (7 días) | Supervisor | ✅ | 13 vencidos y 11 por vencer en 7 días |
| REP-06 | Transferencias por ruta | Gerente | ✅ | Rutas y transferencias tarde marcadas |
| REP-07 | Rotación: baja rotación | Gerente | ✅ | 9 productos de baja rotación |
| REP-08 | Comparativo sin permiso de transferir | Gerente | ✅ | Sugerencias visibles, sin botón Solicitar |
| REP-09 | Cumplimiento de proveedores | Encargado de almacén | ✅ | Detalle filtrado a Proveedor E2E Faltante mwmk6yau |
| REP-10 | Valorización por almacén y categoría | Gerente | ✅ | El desglose por categoría suma el total de cada almacén |
| REP-11 | Integraciones y reproceso | Administrador | ✅ | El mensaje sigue INVALIDO |
| REP-12 | Programar envío por correo | Gerente | ✅ | Creada y enviada; registrada en la bitácora |
| REP-13 | Exportar existencias a Excel | Gerente | ✅ | CSV de 7007 bytes |
| PER-01 | Auditor no registra salidas | Auditor | ✅ | Sin botón de registro |
| PER-02 | Supervisor sin Envío por correo | Supervisor | ✅ | No aparece en el menú |
| PER-03 | Vista en celular | Gerente | ✅ | scrollWidth 390 / 390 px |

**30 de 30 casos pasan.** Errores de JavaScript en consola: 0.
