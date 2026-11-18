const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { crearFiltros } = require("../utils/filtrosReporte");

// Nivel al que conviene reponer una sucursal: el punto de reposición si está
// configurado, si no el mínimo.
const nivelObjetivo = (p) => Math.max(Number(p.stock_minimo) || 0, Number(p.punto_reposicion) || 0);

// Para cada sucursal bajo mínimo propone de dónde traer mercadería: primero la
// que más le sobra por encima de su propio nivel objetivo, preferentemente de la
// misma ciudad. Nunca deja al origen por debajo de su objetivo.
function sugerirTransferencias(producto) {
  const objetivo = nivelObjetivo(producto);
  const excedentes = producto.sucursales
    .map((s) => ({ ...s, excedente: Math.floor(s.disponible - objetivo) }))
    .filter((s) => s.excedente > 0);
  const sugerencias = [];

  const faltantes = producto.sucursales
    .filter((s) => s.bajo_minimo)
    .sort((a, b) => a.disponible - b.disponible);

  for (const destino of faltantes) {
    let necesita = Math.ceil(objetivo - destino.disponible);
    const candidatos = [...excedentes].sort(
      (a, b) =>
        Number(b.ciudad === destino.ciudad) - Number(a.ciudad === destino.ciudad) ||
        b.excedente - a.excedente,
    );
    for (const origen of candidatos) {
      if (necesita <= 0) break;
      if (origen.excedente <= 0) continue;
      const cantidad = Math.min(necesita, origen.excedente);
      sugerencias.push({
        id_almacen_origen: origen.id_almacen,
        almacen_origen: origen.almacen,
        id_almacen_destino: destino.id_almacen,
        almacen_destino: destino.almacen,
        cantidad,
      });
      origen.excedente -= cantidad;
      necesita -= cantidad;
    }
  }
  return sugerencias;
}

// RF67: stock disponible de cada producto en todas las sucursales, sucursales
// bajo mínimo y sugerencia de origen para transferir.
const reporteComparativoSucursales = asyncHandler(async (req, res) => {
  const filtros = crearFiltros();
  filtros.id(req.query.id_producto, "p.id_producto", "El producto no es válido");
  filtros.id(req.query.id_categoria, "p.id_categoria", "La categoría no es válida");
  if (req.query.search) {
    filtros.agregar("(p.nombre ILIKE ? OR p.codigo ILIKE ?)", `%${String(req.query.search).trim()}%`);
  }
  const soloFaltantes = req.query.solo_faltantes === "true";
  // Sin filtro el listado completo sería muy largo: solo se permite para ver
  // los productos con alguna sucursal bajo mínimo.
  if (!req.query.id_producto && !req.query.id_categoria && !req.query.search && !soloFaltantes) {
    throw new ApiError(400, "Indique un producto, una categoría o un texto de búsqueda");
  }

  const [almacenesResult, filasResult] = await Promise.all([
    db.query(
      `SELECT id_almacen, codigo, nombre, tipo, ciudad
       FROM almacenes WHERE activo = TRUE ORDER BY tipo, nombre`,
    ),
    db.query(
      `SELECT p.id_producto, p.codigo, p.nombre, c.nombre AS categoria,
              um.abreviatura AS unidad, p.stock_minimo, p.punto_reposicion,
              a.id_almacen,
              COALESCE(e.cantidad_disponible, 0) AS disponible,
              COALESCE(e.cantidad_total, 0) AS total
       FROM productos p
       INNER JOIN categorias c ON c.id_categoria = p.id_categoria
       INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
       CROSS JOIN almacenes a
       LEFT JOIN vw_reporte_existencias e
         ON e.id_producto = p.id_producto AND e.id_almacen = a.id_almacen
       ${filtros.where(["p.estado = 'ACTIVO'", "a.activo = TRUE"])}
       ORDER BY p.nombre, a.id_almacen
       LIMIT 5000`,
      filtros.valores,
    ),
  ]);

  const almacenes = almacenesResult.rows;
  const porId = new Map(almacenes.map((a) => [a.id_almacen, a]));
  const productos = new Map();

  for (const fila of filasResult.rows) {
    if (!productos.has(fila.id_producto)) {
      productos.set(fila.id_producto, {
        id_producto: fila.id_producto,
        codigo: fila.codigo,
        nombre: fila.nombre,
        categoria: fila.categoria,
        unidad: fila.unidad,
        stock_minimo: Number(fila.stock_minimo),
        punto_reposicion: Number(fila.punto_reposicion),
        sucursales: [],
      });
    }
    const producto = productos.get(fila.id_producto);
    const almacen = porId.get(fila.id_almacen);
    const disponible = Number(fila.disponible);
    producto.sucursales.push({
      id_almacen: fila.id_almacen,
      almacen: almacen.nombre,
      ciudad: almacen.ciudad,
      disponible,
      total: Number(fila.total),
      bajo_minimo: disponible <= producto.stock_minimo,
    });
  }

  let data = [...productos.values()].map((producto) => ({
    ...producto,
    total_disponible: producto.sucursales.reduce((suma, s) => suma + s.disponible, 0),
    sucursales_bajo_minimo: producto.sucursales.filter((s) => s.bajo_minimo).length,
    sugerencias: sugerirTransferencias(producto),
  }));
  if (soloFaltantes) data = data.filter((p) => p.sucursales_bajo_minimo > 0);

  res.json({
    ok: true,
    almacenes,
    data,
    resumen: {
      productos: data.length,
      con_faltantes: data.filter((p) => p.sucursales_bajo_minimo > 0).length,
      sugerencias: data.reduce((suma, p) => suma + p.sugerencias.length, 0),
    },
  });
});

module.exports = { reporteComparativoSucursales, sugerirTransferencias };
