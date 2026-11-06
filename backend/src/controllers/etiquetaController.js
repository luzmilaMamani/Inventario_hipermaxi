const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const { generarPdfEtiquetas } = require("../services/etiquetasPdf");

const MAX_POR_PRODUCTO = 200;
const MAX_TOTAL = 1000;

// Productos activos disponibles para etiquetar (búsqueda por nombre o código).
const listarProductosEtiquetables = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const valores = [];
  let filtro = "";
  if (req.query.search) {
    valores.push(`%${String(req.query.search).trim()}%`);
    filtro = `AND (p.nombre ILIKE $1 OR p.codigo ILIKE $1 OR p.codigo_barras ILIKE $1)`;
  }

  const { rows } = await db.query(
    `SELECT p.id_producto, p.codigo, p.codigo_barras, p.nombre, p.precio,
            c.nombre AS categoria
     FROM productos p
     LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
     WHERE p.estado = 'ACTIVO' ${filtro}
     ORDER BY p.nombre ASC
     LIMIT $${valores.length + 1}`,
    [...valores, limit],
  );

  res.json({ ok: true, data: rows });
});

function leerItems(body) {
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Seleccione al menos un producto");
  }

  const cantidades = new Map();
  for (const item of items) {
    const id = Number(item?.id_producto);
    const cantidad = Number(item?.cantidad);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ApiError(400, "Hay un producto no válido en la selección");
    }
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0 || cantidad > MAX_POR_PRODUCTO) {
      throw new ApiError(
        400,
        `La cantidad de etiquetas debe ser un entero entre 1 y ${MAX_POR_PRODUCTO}`,
      );
    }
    cantidades.set(id, (cantidades.get(id) || 0) + cantidad);
  }

  const total = [...cantidades.values()].reduce((suma, c) => suma + c, 0);
  if (total > MAX_TOTAL) {
    throw new ApiError(400, `No se pueden generar más de ${MAX_TOTAL} etiquetas a la vez`);
  }
  return cantidades;
}

const generarEtiquetas = asyncHandler(async (req, res) => {
  const cantidades = leerItems(req.body);
  const posicionInicial = Number(req.body?.posicion_inicial || 0);
  if (!Number.isSafeInteger(posicionInicial) || posicionInicial < 0 || posicionInicial > 23) {
    throw new ApiError(400, "La posición inicial debe estar entre 1 y 24");
  }

  const ids = [...cantidades.keys()];
  const { rows } = await db.query(
    `SELECT id_producto, codigo, codigo_barras, nombre, precio, estado
     FROM productos
     WHERE id_producto = ANY($1::int[])`,
    [ids],
  );

  if (rows.length !== ids.length) {
    throw new ApiError(404, "Uno o más productos seleccionados no existen");
  }

  // No se generan etiquetas para productos inactivos.
  const inactivos = rows.filter((p) => p.estado !== "ACTIVO");
  if (inactivos.length) {
    throw new ApiError(
      400,
      `No se pueden generar etiquetas para productos inactivos: ${inactivos
        .map((p) => p.nombre)
        .join(", ")}`,
    );
  }

  const porId = new Map(rows.map((p) => [p.id_producto, p]));
  const productos = ids.map((id) => {
    const p = porId.get(id);
    return {
      // Si el producto no tiene código de barras se imprime su código interno.
      codigo: String(p.codigo_barras || p.codigo).trim(),
      nombre: p.nombre,
      precio: p.precio,
      cantidad: cantidades.get(id),
    };
  });

  let pdf;
  try {
    pdf = await generarPdfEtiquetas(productos, { posicionInicial });
  } catch (error) {
    throw new ApiError(400, `No se pudo generar el código de barras: ${error.message}`);
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="etiquetas.pdf"');
  res.setHeader("Content-Length", pdf.length);
  res.send(pdf);
});

module.exports = { listarProductosEtiquetables, generarEtiquetas };
