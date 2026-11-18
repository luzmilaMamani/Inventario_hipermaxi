// HT06 (HIP-251): ejecuta los casos de docs/pruebas/casos_prueba_funcionales.md
// y guarda el resultado en resultados/ (+ capturas de los que fallan).
//   node pruebas-e2e/casos.cjs            todos los casos
//   node pruebas-e2e/casos.cjs TRF-05     solo algunos
const fs = require("node:fs");
const path = require("node:path");
const { abrirSesion, api, dormir } = require("./e2e_lib.cjs");

const SALIDA = process.env.E2E_SALIDA || path.join(__dirname, "resultados");
fs.mkdirSync(SALIDA, { recursive: true });
const hoy = new Date().toISOString().slice(0, 10);
const RUN = Date.now().toString(36);
const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const stockDe = async (codigo, almacen) => {
  const r = await api("ADMINISTRADOR", "GET", `/reportes/existencias?todos=true`);
  const fila = r.body.data.find((f) => f.producto_codigo === codigo && f.almacen_codigo === almacen);
  return fila ? Number(fila.cantidad_total) : 0;
};
const ultimaTransferencia = async () =>
  (await api("ADMINISTRADOR", "GET", "/reportes/transferencias")).body.data[0];

const contexto = {};
const casos = [];
const caso = (id, nombre, rol, fn) => casos.push({ id, nombre, rol, fn });
const esperar = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ---------- Recepción ----------
caso("REC-01", "Recepción conforme", "ENCARGADO_ALMACEN", async (s) => {
  contexto.stockAntesRec = await stockDe("PRD-016", "SUC-001");
  await s.ir("/recepciones/nueva", 2500);
  await s.elegir("Almacén", "SUC-001");
  await s.escribir("Proveedor", "Proveedor E2E Conforme");
  await s.elegir("Producto", "PRD-016");
  await s.escribir("Cantidad esperada", 20);
  await s.escribir("Cantidad recibida", 20);
  await s.clic("Registrar recepción y verificar", { espera: 2000 });
  await s.esperarTexto("La verificación quedó conforme");
  const t = await s.texto();
  contexto.recepcionConforme = t.match(/Recepción (\S+) registrada/)?.[1];
  esperar(contexto.recepcionConforme, "No se mostró el número de la recepción");
  return `Recepción ${contexto.recepcionConforme} conforme`;
});

caso("REC-02", "Recepción con diferencia", "ENCARGADO_ALMACEN", async (s) => {
  await s.ir("/recepciones/nueva", 2500);
  await s.elegir("Almacén", "SUC-001");
  await s.escribir("Proveedor", `Proveedor E2E Faltante ${RUN}`);
  await s.elegir("Producto", "PRD-017");
  await s.escribir("Cantidad esperada", 20);
  await s.escribir("Cantidad recibida", 17);
  await s.clic("Registrar recepción y verificar", { espera: 2000 });
  await s.esperarTexto("con diferencia en 1 línea");
  const r = await api("GERENTE", "GET", `/reportes/cumplimiento-proveedores?proveedor=${encodeURIComponent(`Proveedor E2E Faltante ${RUN}`)}`);
  esperar(r.body.por_proveedor[0]?.unidades_faltantes == 3, `RF69 no muestra el faltante de 3: ${JSON.stringify(r.body.por_proveedor[0])}`);
  return "Diferencia de 3 visible en RF69";
});

caso("REC-03", "No recibir un producto vencido", "ENCARGADO_ALMACEN", async (s) => {
  await s.ir("/recepciones/nueva", 2500);
  await s.elegir("Almacén", "SUC-001");
  await s.escribir("Proveedor", "Proveedor E2E Vencido");
  await s.elegir("Producto", "PRD-001");
  await s.escribir("Cantidad esperada", 5);
  await s.escribir("Cantidad recibida", 5);
  await s.escribir("Fecha de vencimiento", hoy);
  await s.clic("Registrar recepción y verificar", { espera: 1500 });
  await s.esperarTexto("no se puede recibir un producto vencido");
  return "Bloqueado con el mensaje esperado";
});

caso("REC-04", "Confirmar recepción actualiza el stock", "ENCARGADO_ALMACEN", async (s) => {
  const lista = await api("ENCARGADO_ALMACEN", "GET", `/entradas-inventario?search=${contexto.recepcionConforme}`);
  const entrada = (lista.body.data || []).find((e) => e.numero_entrada === contexto.recepcionConforme);
  esperar(entrada, "No se encontró la recepción de REC-01");
  await s.ir(`/recepciones/${entrada.id_entrada}`, 2500);
  await s.clic("Confirmar recepción", { espera: 2500 });
  const despues = await stockDe("PRD-016", "SUC-001");
  esperar(despues === contexto.stockAntesRec + 20, `Stock esperado ${contexto.stockAntesRec + 20}, quedó ${despues}`);
  return `Stock ${contexto.stockAntesRec} → ${despues}`;
});

// ---------- Salidas ----------
const registrarSalida = async (s, { motivo, subtipo, producto, cantidad, boton }) => {
  await s.ir("/salidas", 2200);
  await s.clic("Registrar salida", { espera: 1500 });
  await s.elegir("Almacén", "SUC-001");
  await s.elegir("Motivo", motivo);
  if (subtipo) await s.elegir("Subtipo de pérdida", subtipo);
  if (motivo !== "Venta") await s.escribir("Observaciones", "Prueba funcional E2E: faltante en góndola");
  await s.elegir("Producto", producto);
  await s.escribir("Cantidad", cantidad);
  await s.clic("+ Agregar", { espera: 1500 });
  const trasAgregar = await s.texto();
  await s.clic(boton, { espera: 2500 });
  return trasAgregar;
};

caso("SAL-01", "Venta con FEFO", "ENCARGADO_ALMACEN", async (s) => {
  const antes = await stockDe("PRD-018", "SUC-001");
  await registrarSalida(s, { motivo: "Venta", producto: "PRD-018", cantidad: 3, boton: "Registrar salida" });
  const despues = await stockDe("PRD-018", "SUC-001");
  esperar(despues === antes - 3, `Stock esperado ${antes - 3}, quedó ${despues}`);
  return `Stock ${antes} → ${despues}`;
});

caso("SAL-02", "Pérdida con subtipo en el reporte RF46", "ENCARGADO_ALMACEN", async (s) => {
  await registrarSalida(s, { motivo: "Pérdida", subtipo: "Robo", producto: "PRD-019", cantidad: 1, boton: "Registrar pérdida" });
  const r = await api("GERENTE", "GET", `/reportes/perdidas?tipo=PERDIDA&motivo=ROBO&fecha_desde=${hoy}&fecha_hasta=${hoy}`);
  const fila = r.body.data.find((f) => f.producto_codigo === "PRD-019");
  esperar(fila && Number(fila.valor_total) > 0, "La pérdida no aparece valorizada en RF46");
  return `${fila.numero_salida} valorizada en Bs ${fila.valor_total}`;
});

caso("SAL-03", "Salida mayor al disponible", "ENCARGADO_ALMACEN", async (s) => {
  const antes = await stockDe("PRD-020", "SUC-001");
  const t = await registrarSalida(s, { motivo: "Venta", producto: "PRD-020", cantidad: 99999, boton: "Registrar salida" });
  esperar(/insuficiente|no tiene suficiente|Solo hay \d+ unidades/i.test(t), "No se mostró el error de stock insuficiente");
  esperar((await stockDe("PRD-020", "SUC-001")) === antes, "El stock cambió");
  return "Error de stock insuficiente y stock sin cambios";
});

// ---------- Transferencias ----------
const solicitarTransferencia = async (s, producto, cantidad) => {
  await s.ir("/transferencias", 2200);
  await s.clic("+ Nueva transferencia", { espera: 1500 });
  await s.elegir("Almacén Origen", "ALM-001");
  await s.elegir("Almacén Destino", "SUC-002");
  await s.elegir("Producto", producto);
  await s.escribir("Cantidad", cantidad);
  await s.clic("+ Agregar", { espera: 500 });
  await s.clic("Solicitar Transferencia", { exacto: true, espera: 2500 });
};

caso("TRF-01", "Solicitar transferencia", "ENCARGADO_ALMACEN", async (s) => {
  await solicitarTransferencia(s, "PRD-021", 5);
  const t = await ultimaTransferencia();
  esperar(t.estado === "SOLICITADA" && t.almacen_destino === "Sucursal Sur", `Última transferencia: ${t.numero_transferencia} ${t.estado}`);
  contexto.trf1 = t.numero_transferencia;
  return `${t.numero_transferencia} SOLICITADA`;
});

const flujoCompleto = async (s, numero, recibir) => {
  await s.ir("/transferencias", 2200);
  await s.clicEnFila(numero, "Aprobar", 2000);
  await s.clicEnFila(numero, "Registrar Envío", 1000);
  await s.escribir("Fecha Estimada de Llegada", manana);
  await s.clic("Confirmar Envío", { espera: 2500 });
  await s.clicEnFila(numero, "Registrar Recepción", 2000);
  await s.escribir("Recibido", recibir);
  if (recibir !== 5) await s.evaluar(`(() => { const i = [...document.querySelectorAll('input')].find(x => (x.getAttribute('aria-label')||'').startsWith('Observación')); if (i) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Llegó una unidad rota'); i.dispatchEvent(new Event('input',{bubbles:true})); } return true; })()`);
  await s.clic("Confirmar Recepción", { espera: 2500 });
};

caso("TRF-02", "Aprobar, enviar y recibir completa", "ADMINISTRADOR", async (s) => {
  const origen = await stockDe("PRD-021", "ALM-001");
  const destino = await stockDe("PRD-021", "SUC-002");
  await flujoCompleto(s, contexto.trf1, 5);
  const r = await api("GERENTE", "GET", "/reportes/transferencias?estado=RECIBIDA");
  const t = r.body.data.find((x) => x.numero_transferencia === contexto.trf1);
  esperar(t, `La transferencia ${contexto.trf1} no quedó RECIBIDA`);
  const o2 = await stockDe("PRD-021", "ALM-001");
  const d2 = await stockDe("PRD-021", "SUC-002");
  esperar(o2 === origen - 5 && d2 === destino + 5, `Stock origen ${origen}→${o2}, destino ${destino}→${d2}`);
  contexto.dialogosAprobacion = s.dialogos.slice();
  return `RECIBIDA; origen ${origen}→${o2}, destino ${destino}→${d2}; entrega ${t.horas_entrega} h`;
});

caso("TRF-03", "Recibir con diferencia", "ADMINISTRADOR", async (s) => {
  await solicitarTransferencia(s, "PRD-022", 5);
  const numero = (await ultimaTransferencia()).numero_transferencia;
  await flujoCompleto(s, numero, 4);
  const t = (await api("GERENTE", "GET", "/reportes/transferencias")).body.data.find((x) => x.numero_transferencia === numero);
  esperar(t?.estado === "RECIBIDA_CON_DIFERENCIAS" && Number(t.diferencia_unidades) === -1, `Quedó ${t?.estado} con diferencia ${t?.diferencia_unidades}`);
  return `${numero} RECIBIDA_CON_DIFERENCIAS (−1)`;
});

caso("TRF-04", "Solicitar desde el comparativo", "ENCARGADO_ALMACEN", async (s) => {
  await s.ir("/reportes/comparativo-sucursales", 3000);
  await s.clic("Solicitar", { exacto: true, espera: 2500 });
  const obs = await s.evaluar(`[...document.querySelectorAll('textarea')].map(x => x.value).join(' ')`);
  esperar(obs.includes("Reposición sugerida"), "El formulario no vino precargado");
  await s.clic("Solicitar Transferencia", { exacto: true, espera: 2500 });
  await s.esperarTexto("Solicitud de transferencia registrada");
  const ultima = await ultimaTransferencia();
  esperar(ultima.estado === "SOLICITADA", "No quedó SOLICITADA");
  return `${ultima.numero_transferencia} ${ultima.almacen_origen} → ${ultima.almacen_destino}`;
});

caso("TRF-05", "Mensaje de confirmación al aprobar", "ADMINISTRADOR", async (s) => {
  await solicitarTransferencia(s, "PRD-024", 2);
  const numero = (await ultimaTransferencia()).numero_transferencia;
  s.dialogos.length = 0;
  await s.ir("/transferencias", 2200);
  await s.clicEnFila(numero, "Aprobar", 2000);
  const mensaje = s.dialogos[0] || "(sin confirmación)";
  esperar(/aprob/i.test(mensaje), `Al aprobar se pregunta: "${mensaje}"`);
  return `Pregunta: "${mensaje}"`;
});

// ---------- Inventario físico ----------
caso("INV-01", "Programar un inventario", "ENCARGADO_ALMACEN", async (s) => {
  const antes = (await api("ADMINISTRADOR", "GET", "/inventarios?limit=200")).body.data || [];
  await s.ir("/inventarios", 2200);
  await s.clic("+ Planificar Inventario", { espera: 1200 });
  await s.elegir("Almacén", "Sucursal Sur");
  await s.escribir("Fecha Programada", hoy);
  await s.clic("Guardar", { exacto: true, espera: 2500 });
  const despues = (await api("ADMINISTRADOR", "GET", "/inventarios?limit=200")).body.data || [];
  const nuevo = despues.find((i) => !antes.some((a) => a.id_inventario === i.id_inventario));
  esperar(nuevo, "No se creó el inventario");
  contexto.inventario = nuevo;
  return `${nuevo.numero_inventario} ${nuevo.estado}`;
});

caso("INV-02", "Registrar conteo con diferencia", "ENCARGADO_ALMACEN", async (s) => {
  const id = contexto.inventario.id_inventario;
  const sistema = await stockDe("PRD-023", "SUC-002");
  await s.ir(`/inventarios/${id}`, 2500);
  await s.elegir("Producto", "PRD-023");
  await s.escribir("Cantidad Física", sistema - 2);
  await s.clic("+ Agregar", { espera: 2000 });
  await s.ir(`/inventarios/${id}/diferencias`, 2500);
  const t = await s.texto();
  esperar(/-2|−2/.test(t), "La pantalla de diferencias no muestra −2");
  return `Sistema ${sistema}, físico ${sistema - 2}, diferencia −2`;
});

// ---------- Reportes ----------
caso("REP-01", "Tablero de indicadores", "GERENTE", async (s) => {
  await s.ir("/reportes/indicadores", 3000);
  const t = await s.texto();
  for (const k of ["Valor total del inventario", "Índice de rotación", "Tasa de quiebre", "Tasa de merma", "Exactitud", "Valor en riesgo", "Cumplimiento de proveedores"]) {
    esperar(t.includes(k), `Falta el KPI ${k}`);
  }
  await s.elegir("Período", "Últimos 90 días");
  await dormir(2000);
  await s.clic("Tasa de merma", { espera: 2500 });
  esperar((await s.url()) === "/reportes/perdidas", `El clic llevó a ${await s.url()}`);
  return "7 KPIs; el clic en merma abre Pérdidas";
});

caso("REP-02", "Existencias con filtros", "GERENTE", async (s) => {
  await s.ir("/reportes/existencias", 3000);
  await s.elegir("Almacén", "SUC-002");
  await dormir(2000);
  const r = await api("GERENTE", "GET", "/reportes/existencias?id_almacen=3&estado=ACTIVO&solo_con_stock=true&todos=true");
  const suma = r.body.data.reduce((a, f) => a + Number(f.valor_total), 0);
  const cat = r.body.por_categoria.reduce((a, f) => a + Number(f.valor_total), 0);
  esperar(Math.abs(suma - Number(r.body.resumen.valor_total)) < 0.01 && Math.abs(cat - suma) < 0.01, `Totales no cuadran: detalle ${suma}, categorías ${cat}, resumen ${r.body.resumen.valor_total}`);
  const t = await s.texto();
  esperar(t.includes("Sucursal Sur") && !t.includes("Almacén Central Bs"), "El filtro no se aplicó");
  return `Detalle = categorías = resumen = Bs ${suma.toFixed(2)}`;
});

caso("REP-03", "Movimientos por tipo", "AUDITOR", async (s) => {
  await s.ir("/reportes/movimientos", 3000);
  await s.escribir("Desde", "2026-05-01");
  await dormir(2000);
  await s.clic("Ajustes", { espera: 2500 });
  const filas = await s.evaluar(`[...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.split('\\n')[1] || '')`);
  esperar(filas.length && filas.every((f) => f.includes("Ajuste")), `Hay filas que no son ajustes: ${filas.slice(0, 3)}`);
  return `${filas.length} filas, todas ajustes`;
});

caso("REP-04", "Pérdidas consolidadas por tipo", "GERENTE", async (s) => {
  await s.ir("/reportes/perdidas", 3000);
  await s.elegir("Tipo de pérdida", "Daño");
  await dormir(2000);
  const motivos = await s.evaluar(`[...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.textContent==='Todos' ) && x.closest('div').innerText.startsWith('Motivo')) ? [...[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Motivo')).parentElement.querySelector('select').options].map(o=>o.textContent) : []`);
  esperar(motivos.every((m) => ["Todos", "Roto", "Deterioro", "Inutilizable", "Otro", "Sin detalle"].includes(m)), `Motivos de otros tipos: ${motivos}`);
  return `Motivos: ${motivos.join(", ")}`;
});

caso("REP-05", "Lotes por vencer (7 días)", "SUPERVISOR", async (s) => {
  await s.ir("/reportes/vencimientos-lotes", 3000);
  await s.elegir("Rango", "Próximos 7 días");
  await dormir(2000);
  const r = await api("SUPERVISOR", "GET", "/reportes/vencimientos-lotes?dias=7");
  esperar(r.body.proximos.every((l) => l.dias_restantes >= 1 && l.dias_restantes <= 7), "Hay lotes fuera del rango");
  esperar(r.body.vencidos.every((l) => l.dias_restantes <= 0), "Hay vencidos con días positivos");
  esperar((await s.texto()).includes("Lotes vencidos"), "No se ve la sección de vencidos");
  return `${r.body.vencidos.length} vencidos y ${r.body.proximos.length} por vencer en 7 días`;
});

caso("REP-06", "Transferencias por ruta", "GERENTE", async (s) => {
  await s.ir("/reportes/transferencias", 3000);
  const t = await s.texto();
  esperar(t.includes("Tiempo de entrega por ruta") && t.includes("→"), "No se ve el tiempo por ruta");
  return t.includes("(tarde)") ? "Rutas y transferencias tarde marcadas" : "Rutas visibles (ninguna tarde)";
});

caso("REP-07", "Rotación: baja rotación", "GERENTE", async (s) => {
  await s.ir("/reportes/rotacion", 3500);
  await s.clic("Baja rotación", { espera: 2500 });
  const clases = await s.evaluar(`[...document.querySelectorAll('tbody tr td:nth-child(3)')].map(td => td.innerText.trim())`);
  esperar(clases.length && clases.every((c) => c.includes("Baja")), `Clases: ${[...new Set(clases)]}`);
  return `${clases.length} productos de baja rotación`;
});

caso("REP-08", "Comparativo sin permiso de transferir", "GERENTE", async (s) => {
  await s.ir("/reportes/comparativo-sucursales", 3000);
  const botones = await s.evaluar(`[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Solicitar').length`);
  esperar((await s.texto()).includes(" de ") && botones === 0, `Botones Solicitar visibles: ${botones}`);
  return "Sugerencias visibles, sin botón Solicitar";
});

caso("REP-09", "Cumplimiento de proveedores", "ENCARGADO_ALMACEN", async (s) => {
  await s.ir("/reportes/cumplimiento-proveedores", 3000);
  await s.evaluar(`document.querySelector('tbody tr.cursor-pointer').click(); true`);
  await dormir(800);
  const t = await s.texto();
  const proveedor = t.match(/Detalle de diferencias · ([^(]+) \(/)?.[1]?.trim();
  esperar(proveedor, "No se filtró el detalle");
  const otros = await s.evaluar(`[...document.querySelectorAll('table')][1].querySelectorAll('tbody tr td:nth-child(2)').length ? [...[...document.querySelectorAll('table')][1].querySelectorAll('tbody tr td:nth-child(2)')].map(td=>td.innerText.trim()) : []`);
  esperar(otros.every((p) => p === proveedor || p === "Sin diferencias registradas"), `Hay filas de otros proveedores`);
  return `Detalle filtrado a ${proveedor}`;
});

caso("REP-10", "Valorización por almacén y categoría", "GERENTE", async (s) => {
  await s.ir("/reportes/valorizacion", 3000);
  await s.evaluar(`document.querySelector('tbody tr.cursor-pointer').click(); true`);
  await dormir(600);
  const r = await api("GERENTE", "GET", "/reportes/valorizacion");
  for (const a of r.body.por_almacen) {
    const suma = a.categorias.reduce((x, c) => x + Number(c.valor_total), 0);
    esperar(Math.abs(suma - Number(a.valor_total)) < 0.01, `${a.almacen}: categorías ${suma} ≠ ${a.valor_total}`);
  }
  esperar((await s.texto()).includes("del almacén"), "No se desplegó el desglose");
  return "El desglose por categoría suma el total de cada almacén";
});

caso("REP-11", "Integraciones y reproceso", "ADMINISTRADOR", async (s) => {
  await s.ir("/reportes/integraciones", 3500);
  const antes = await s.evaluar(`[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='Reprocesar').length`);
  esperar(antes > 0, "No hay mensajes con error para reprocesar");
  await s.clic("Reprocesar", { exacto: true, espera: 3000 });
  const t = await s.texto();
  esperar(/Mensaje reprocesado|sigue (ERROR|INVALIDO)/.test(t), "No se mostró el resultado del reproceso");
  return t.match(/(Mensaje reprocesado correctamente|El mensaje sigue [A-Z]+)/)[0];
});

caso("REP-12", "Programar envío por correo", "GERENTE", async (s) => {
  await s.ir("/reportes/programacion", 2500);
  await s.clic("+ Nueva programación", { espera: 1000 });
  await s.escribir("Nombre", "E2E semanal de existencias");
  await s.elegir("Reporte", "Existencias");
  await s.elegir("Frecuencia", "Semanal");
  await s.elegir("Día", "Lunes");
  await s.escribir("Destinatarios", "gerente@hipermaxi.test");
  await s.clic("Guardar", { exacto: true, espera: 2500 });
  await s.esperarTexto("Programación creada");
  await s.clicEnFila("E2E semanal de existencias", "Enviar ahora", 4000);
  const t = await s.texto();
  esperar(/Reporte enviado|No se pudo enviar/.test(t), "No hubo respuesta del envío");
  return t.includes("Reporte enviado") ? "Creada y enviada; registrada en la bitácora" : "Creada; el envío quedó con error en la bitácora";
});

caso("REP-13", "Exportar existencias a Excel", "GERENTE", async (s) => {
  await s.ir("/reportes/existencias", 3000);
  await s.evaluar(`window.__descargas = []; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { window.__descargas.push(b.size); return orig(b); }; true`);
  await s.clic("Exportar Excel", { espera: 2500 });
  const tamanos = await s.evaluar("window.__descargas");
  esperar(tamanos?.length === 1 && tamanos[0] > 1000, `Descargas: ${JSON.stringify(tamanos)}`);
  return `CSV de ${tamanos[0]} bytes`;
});

// ---------- Permisos ----------
caso("PER-01", "Auditor no registra salidas", "AUDITOR", async (s) => {
  await s.ir("/salidas", 2500);
  const hay = await s.evaluar(`[...document.querySelectorAll('button')].some(b => b.innerText.includes('Registrar salida'))`);
  esperar(!hay, "El auditor ve el botón Registrar salida");
  return "Sin botón de registro";
});

caso("PER-02", "Supervisor sin Envío por correo", "SUPERVISOR", async (s) => {
  await s.ir("/reportes/indicadores", 2500);
  const t = await s.evaluar("document.body.innerText");
  esperar(!t.includes("Envío por correo"), "El supervisor ve Envío por correo");
  return "No aparece en el menú";
});

caso("PER-03", "Vista en celular", "GERENTE", async () => {
  const resultados = [];
  for (const ruta of ["/reportes/indicadores", "/reportes/existencias"]) {
    const m = await abrirSesion("GERENTE", { ancho: 390 });
    await m.ir(ruta, 3000);
    resultados.push(await m.evaluar("document.documentElement.scrollWidth"));
    await m.cerrar();
  }
  esperar(resultados.every((w) => w <= 390), `Ancho de página: ${resultados}`);
  return `scrollWidth ${resultados.join(" / ")} px`;
});

(async () => {
  const soloIds = process.argv.slice(2);
  const archivo = soloIds.length ? "resultados_parcial.json" : "resultados.json";
  const resultados = [];
  for (const c of casos) {
    if (soloIds.length && !soloIds.includes(c.id)) continue;
    const s = await abrirSesion(c.rol);
    const inicio = Date.now();
    let estado = "PASA";
    let detalle = "";
    try {
      detalle = await c.fn(s);
    } catch (e) {
      estado = "FALLA";
      detalle = e.message;
      await s.captura(path.join(SALIDA, `${c.id}.png`)).catch(() => {});
    }
    const erroresJs = s.errores.filter((x) => !/Download the React DevTools/.test(x));
    resultados.push({ id: c.id, caso: c.nombre, rol: c.rol, estado, detalle, ms: Date.now() - inicio, errores_js: erroresJs, dialogos: s.dialogos });
    console.log(`${estado === "PASA" ? "✅" : "❌"} ${c.id} ${c.nombre}: ${detalle}${erroresJs.length ? ` [errores JS: ${erroresJs.length}]` : ""}`);
    await s.cerrar();
  }
  fs.writeFileSync(path.join(SALIDA, archivo), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.filter((r) => r.estado === "PASA").length}/${resultados.length} pasan`);
  process.exit(0);
})();
