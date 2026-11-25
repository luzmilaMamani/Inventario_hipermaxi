// Pruebas de integración de la API contra el backend ya levantado.
// Ese backend debe apuntar a una base de prueba (no a producción).
//
//   API_URL=http://localhost:3000 API_USUARIO=admin API_PASSWORD=Admin123* npm run test:integracion
//
// Cada endpoint principal tiene un caso exitoso (consulta la base) y uno de error.

const { describe, test, before } = require("node:test");
const assert = require("node:assert/strict");

const base = (process.env.API_URL || "http://localhost:3000").replace(/\/$/, "");
const usuario = process.env.API_USUARIO || "admin";
const password = process.env.API_PASSWORD || "Admin123*";

const LECTURAS = [
  ["Productos", "/api/productos?limit=5"],
  ["Búsqueda de productos", "/api/productos/buscar?q=a"],
  ["Almacenes", "/api/almacenes?limit=5"],
  ["Categorías", "/api/catalogos/categorias"],
  ["Subcategorías", "/api/catalogos/subcategorias"],
  ["Marcas", "/api/catalogos/marcas"],
  ["Unidades de medida", "/api/catalogos/unidades-medida"],
  ["Ubicaciones", "/api/ubicaciones?limit=5"],
  ["Consulta de stock", "/api/stock/consulta?limit=5"],
  ["Lotes", "/api/lotes?limit=5"],
  ["Recepciones", "/api/entradas-inventario?limit=5"],
  ["Salidas", "/api/salidas?limit=5"],
  ["Transferencias", "/api/transferencias?limit=5"],
  ["Ajustes", "/api/ajustes-inventario?limit=5"],
  ["Inventarios físicos", "/api/inventarios?limit=5"],
  ["Alertas de stock", "/api/alertas-stock?limit=5"],
  ["Alertas de vencimiento", "/api/alertas-vencimiento?limit=5"],
  ["Movimientos", "/api/movimientos-inventario?limit=5"],
  ["Usuarios", "/api/usuarios?limit=5"],
  ["Reporte de existencias", "/api/reportes/existencias?limit=5"],
  ["Reporte de stock bajo", "/api/reportes/stock-bajo?limit=5"],
  ["Reporte de ajustes", "/api/reportes/ajustes?limit=5"],
  ["Reporte de movimientos", "/api/reportes/movimientos?limit=5"],
  ["Reporte de pérdidas", "/api/reportes/perdidas"],
  ["Reporte de rotación", "/api/reportes/rotacion"],
  ["Reporte de valorización", "/api/reportes/valorizacion"],
  ["Indicadores", "/api/reportes/indicadores"],
  ["Comparativo de sucursales", "/api/reportes/comparativo-sucursales?solo_faltantes=true"],
];

const ERRORES_VALIDACION = [
  ["Kardex sin producto", "GET", "/api/reportes/kardex", null, 400],
  ["Stock bajo con almacén inválido", "GET", "/api/reportes/stock-bajo?id_almacen=abc", null, 400],
  ["Ajustes con fecha inválida", "GET", "/api/reportes/ajustes?fecha_desde=31/13/2026", null, 400],
  ["Movimientos con tipo inválido", "GET", "/api/reportes/movimientos?tipo=OTRO", null, 400],
  ["Comparativo sin filtro", "GET", "/api/reportes/comparativo-sucursales", null, 400],
  ["Producto inexistente", "GET", "/api/productos/999999999", null, 404],
  ["Almacén inexistente", "GET", "/api/almacenes/999999999", null, 404],
  ["Ajuste inexistente", "GET", "/api/ajustes-inventario/999999999", null, 404],
  ["Crear producto sin datos", "POST", "/api/productos", {}, 400],
  ["Crear salida sin datos", "POST", "/api/salidas", {}, 400],
  ["Crear recepción sin datos", "POST", "/api/entradas-inventario", {}, 400],
  ["Crear transferencia sin datos", "POST", "/api/transferencias", {}, 400],
  ["Crear ajuste sin datos", "POST", "/api/ajustes-inventario", {}, 400],
  ["Crear categoría sin nombre", "POST", "/api/categorias", {}, 400],
];

async function pedir(path, { method = "GET", token, body } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const causa = error.cause?.code || error.message;
    throw new Error(
      `No hay conexión con el backend en ${base} (${causa}). ` +
        "Levantá el backend con la base de prueba y volvé a correr npm run test:integracion.",
    );
  }
  const texto = await respuesta.text();
  let json = null;
  if (texto) {
    try {
      json = JSON.parse(texto);
    } catch {
      json = { raw: texto };
    }
  }
  return { status: respuesta.status, json };
}

function detalle(respuesta) {
  return `${respuesta.status} ${respuesta.json?.message || ""}`.trim();
}

let token = "";
let idProducto = null;
let idAlmacen = null;

before(async () => {
  const salud = await pedir("/health");
  assert.equal(salud.status, 200, detalle(salud));
  assert.equal(salud.json?.ok, true);

  const login = await pedir("/api/auth/login", {
    method: "POST",
    body: { nombre_usuario: usuario, password },
  });
  assert.equal(login.status, 200, detalle(login));
  assert.ok(login.json?.token, "El login no devolvió token");
  token = login.json.token;

  const productos = await pedir("/api/productos?limit=1", { token });
  const almacenes = await pedir("/api/almacenes?limit=1", { token });
  idProducto = productos.json?.data?.[0]?.id_producto || null;
  idAlmacen = almacenes.json?.data?.[0]?.id_almacen || null;
});

describe("Autenticación", () => {
  test("POST /api/auth/login acepta las credenciales de la base de prueba", async () => {
    const respuesta = await pedir("/api/auth/login", {
      method: "POST",
      body: { nombre_usuario: usuario, password },
    });
    assert.equal(respuesta.status, 200, detalle(respuesta));
    assert.equal(respuesta.json.ok, true);
    assert.equal(respuesta.json.user.nombre_usuario, usuario);
  });

  test("POST /api/auth/login rechaza una contraseña incorrecta", async () => {
    const respuesta = await pedir("/api/auth/login", {
      method: "POST",
      body: { nombre_usuario: usuario, password: "clave-incorrecta" },
    });
    assert.equal(respuesta.status, 401, detalle(respuesta));
    assert.equal(respuesta.json.ok, false);
  });

  test("GET /api/auth/me devuelve el usuario del token", async () => {
    const respuesta = await pedir("/api/auth/me", { token });
    assert.equal(respuesta.status, 200, detalle(respuesta));
    assert.equal(respuesta.json.data.nombre_usuario, usuario);
  });

  test("GET /api/auth/me sin token responde 401", async () => {
    const respuesta = await pedir("/api/auth/me");
    assert.equal(respuesta.status, 401, detalle(respuesta));
    assert.equal(respuesta.json.ok, false);
  });
});

describe("Consultas principales", () => {
  for (const [nombre, path] of LECTURAS) {
    test(`${nombre} responde 200 con datos de la base`, async () => {
      const respuesta = await pedir(path, { token });
      assert.equal(respuesta.status, 200, `${nombre}: ${detalle(respuesta)}`);
      assert.equal(respuesta.json?.ok, true, nombre);
    });

    test(`${nombre} sin token responde 401`, async () => {
      const respuesta = await pedir(path);
      assert.equal(respuesta.status, 401, `${nombre}: ${detalle(respuesta)}`);
      assert.equal(respuesta.json?.ok, false);
    });
  }
});

describe("Errores de validación y recursos inexistentes", () => {
  for (const [nombre, method, path, body, status] of ERRORES_VALIDACION) {
    test(`${nombre} responde ${status}`, async () => {
      const respuesta = await pedir(path, { method, token, body });
      assert.equal(respuesta.status, status, `${nombre}: ${detalle(respuesta)}`);
      assert.equal(respuesta.json?.ok, false);
    });
  }
});

describe("Kardex y alta de categoría", () => {
  test("GET /api/reportes/kardex devuelve el saldo del producto en el almacén", async () => {
    assert.ok(idProducto, "La base de prueba no tiene productos. Cargá backend/sql/seed_datos_prueba.sql");
    assert.ok(idAlmacen, "La base de prueba no tiene almacenes. Cargá backend/sql/seed_datos_prueba.sql");
    const respuesta = await pedir(
      `/api/reportes/kardex?id_producto=${idProducto}&id_almacen=${idAlmacen}`,
      { token },
    );
    assert.equal(respuesta.status, 200, detalle(respuesta));
    assert.equal(respuesta.json.ok, true);
    assert.equal(respuesta.json.resumen.cuadra, true);
    assert.equal(Number(respuesta.json.resumen.saldo_final), Number(respuesta.json.resumen.stock_actual));
  });

  test("POST /api/categorias crea una categoría y se puede desactivar", async () => {
    const nombre = `ZZ-PRUEBA-${Date.now()}`;
    const creada = await pedir("/api/categorias", {
      method: "POST",
      token,
      body: { nombre, descripcion: "Creada por la prueba de integración" },
    });
    assert.equal(creada.status, 201, detalle(creada));
    assert.equal(creada.json.ok, true);
    assert.equal(creada.json.data.nombre, nombre);

    const baja = await pedir(`/api/categorias/${creada.json.data.id_categoria}`, {
      method: "DELETE",
      token,
    });
    assert.equal(baja.status, 200, detalle(baja));
    assert.equal(baja.json.data.activo, false);
  });
});
