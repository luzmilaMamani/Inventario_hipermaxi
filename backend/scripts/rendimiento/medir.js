// HT08 (HIP-256): mide el tiempo de respuesta de las consultas y reportes
// principales. Criterio: cada consulta debe responder en menos de 3 segundos.
//
//   node scripts/rendimiento/medir.js [url_api] [repeticiones]
//   node scripts/rendimiento/medir.js http://localhost:3000/api 5
//
// Firma un token de ADMINISTRADOR con el JWT_SECRET de backend/.env, así que solo
// sirve contra un backend propio (de pruebas).

require("dotenv").config();
const jwt = require("jsonwebtoken");

const [url = "http://localhost:3000/api", repeticionesTexto = "5"] = process.argv.slice(2);
const repeticiones = Math.max(Number(repeticionesTexto) || 5, 1);
const LIMITE_MS = 3000;

const hoy = new Date().toISOString().slice(0, 10);
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

const CONSULTAS = [
  ["Consulta de stock (página 1)", "/stock?page=1&limit=50"],
  ["Consulta de stock con búsqueda", "/stock?search=Producto%201&limit=50"],
  ["Historial de un producto", "/stock/historial/1?limit=50"],
  ["Próximos vencimientos", "/stock/proximos-vencer?dias=30&limit=50"],
  ["RF44 Existencias", "/reportes/existencias?solo_con_stock=true"],
  ["RF45 Movimientos (mes)", `/reportes/movimientos?fecha_desde=${hace(30)}&fecha_hasta=${hoy}&limit=50`],
  ["RF45 Movimientos (año, por tipo)", `/reportes/movimientos?fecha_desde=${hace(365)}&fecha_hasta=${hoy}&tipo=SALIDA&limit=50`],
  ["RF46 Pérdidas (año)", `/reportes/perdidas?fecha_desde=${hace(365)}&fecha_hasta=${hoy}`],
  ["RF62 Indicadores (mes)", "/reportes/indicadores"],
  ["RF62 Indicadores (6 meses)", `/reportes/indicadores?fecha_desde=${hace(180)}&fecha_hasta=${hoy}`],
  ["RF63 Lotes por vencer", "/reportes/vencimientos-lotes?dias=30"],
  ["RF64 Transferencias (año)", `/reportes/transferencias?fecha_desde=${hace(365)}&fecha_hasta=${hoy}`],
  ["RF65 Rotación (90 días)", "/reportes/rotacion"],
  ["RF67 Comparativo con faltantes", "/reportes/comparativo-sucursales?solo_faltantes=true"],
  ["RF69 Cumplimiento proveedores", "/reportes/cumplimiento-proveedores"],
  ["RF71 Valorización", "/reportes/valorizacion"],
  ["RF75 Métricas de integraciones", "/integraciones/metricas"],
];

const token = jwt.sign({ id_usuario: 1, nombre_usuario: "rendimiento", rol: "ADMINISTRADOR" }, process.env.JWT_SECRET, {
  expiresIn: "1h",
});

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(Math.ceil((p / 100) * orden.length) - 1, orden.length - 1)];
};

(async () => {
  console.log(`Midiendo ${CONSULTAS.length} consultas contra ${url} (${repeticiones} repeticiones, límite ${LIMITE_MS} ms)\n`);
  const resultados = [];
  for (const [nombre, ruta] of CONSULTAS) {
    const tiempos = [];
    let estado = 0;
    let bytes = 0;
    // Una llamada previa para calentar caché de planes y conexiones.
    await fetch(`${url}${ruta}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    for (let i = 0; i < repeticiones; i += 1) {
      const inicio = performance.now();
      const respuesta = await fetch(`${url}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
      const cuerpo = await respuesta.arrayBuffer();
      tiempos.push(performance.now() - inicio);
      estado = respuesta.status;
      bytes = cuerpo.byteLength;
    }
    const p95 = percentil(tiempos, 95);
    resultados.push({
      consulta: nombre,
      http: estado,
      mediana_ms: Math.round(percentil(tiempos, 50)),
      p95_ms: Math.round(p95),
      max_ms: Math.round(Math.max(...tiempos)),
      kb: Math.round(bytes / 1024),
      cumple: estado === 200 && p95 < LIMITE_MS ? "sí" : "NO",
    });
  }
  console.table(resultados);
  const fallan = resultados.filter((r) => r.cumple !== "sí");
  console.log(fallan.length ? `\n${fallan.length} consulta(s) no cumplen el límite.` : "\nTodas las consultas cumplen el límite.");
  process.exitCode = fallan.length ? 1 : 0;
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
