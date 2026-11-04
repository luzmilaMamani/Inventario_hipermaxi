const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }
  const parsed = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === fecha;
}

const crearInventario = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }
  const { id_almacen, fecha_programada, alcance = "TODO" } = req.body;
  const idAlmacen = Number(id_almacen);
  const alcanceNormalizado = typeof alcance === "string" ? alcance.trim() : "";
  if (typeof id_almacen === "boolean" || !Number.isSafeInteger(idAlmacen) || idAlmacen <= 0) {
    throw new ApiError(400, "Debe seleccionar un almacén válido");
  }
  if (!esFechaValida(fecha_programada)) {
    throw new ApiError(400, "La fecha programada no es válida");
  }
  if (!alcanceNormalizado || alcanceNormalizado.length > 200) {
    throw new ApiError(400, "El alcance es obligatorio y no puede superar 200 caracteres");
  }

  const almacen = await db.query(
    "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
    [idAlmacen],
  );
  if (!almacen.rowCount) throw new ApiError(400, "El almacén no existe o está inactivo");

  const existe = await db.query(
    `SELECT id_inventario FROM inventarios_fisicos WHERE id_almacen = $1 AND estado IN ('PROGRAMADO', 'EN_CONTEO')`,
    [idAlmacen]
  );
  if (existe.rowCount > 0) throw new ApiError(400, "Ya existe un inventario activo para este almacén");

  const numero = `INV-${Date.now()}`;
  const result = await db.query(
    `INSERT INTO inventarios_fisicos (numero_inventario, id_almacen, id_usuario, fecha_programada, estado, observaciones)
     VALUES ($1, $2, $3, $4, 'PROGRAMADO', $5) RETURNING *`,
    [numero, idAlmacen, req.user.id_usuario, fecha_programada, `Alcance: ${alcanceNormalizado}`]
  );
  res.status(201).json({ ok: true, data: result.rows[0] });
});

const listarInventarios = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT i.*, a.nombre AS almacen FROM inventarios_fisicos i
     INNER JOIN almacenes a ON a.id_almacen = i.id_almacen ORDER BY i.fecha_programada DESC`
  );
  res.json({ ok: true, data: result.rows });
});

const registrarConteo = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }
  const idInventario = Number(req.params.id_inventario);
  const idProducto = Number(req.body.id_producto);
  const cantidadFisica = Number(req.body.cantidad_fisica);
  const idLote = req.body.id_lote === undefined || req.body.id_lote === null || req.body.id_lote === ""
    ? null
    : Number(req.body.id_lote);

  if (!Number.isSafeInteger(idInventario) || idInventario <= 0) {
    throw new ApiError(400, "El ID del inventario no es válido");
  }
  if (typeof req.body.id_producto === "boolean" ||
      !Number.isSafeInteger(idProducto) ||
      idProducto <= 0) {
    throw new ApiError(400, "Debe seleccionar un producto válido");
  }
  if (req.body.cantidad_fisica === undefined ||
      typeof req.body.cantidad_fisica === "boolean" ||
      !Number.isSafeInteger(cantidadFisica) ||
      cantidadFisica < 0) {
    throw new ApiError(400, "La cantidad física debe ser un número entero igual o mayor a 0");
  }
  if (idLote !== null &&
      (typeof req.body.id_lote === "boolean" ||
        !Number.isSafeInteger(idLote) ||
        idLote <= 0)) {
    throw new ApiError(400, "El lote no es válido");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const inv = await client.query(
      `SELECT estado, id_almacen FROM inventarios_fisicos
       WHERE id_inventario = $1 FOR UPDATE`,
      [idInventario],
    );
    if (!inv.rowCount) throw new ApiError(404, "Inventario no encontrado");
    if (!["PROGRAMADO", "EN_CONTEO"].includes(inv.rows[0].estado)) {
      throw new ApiError(400, "El inventario no está abierto para conteo");
    }

    const producto = await client.query(
      "SELECT id_producto FROM productos WHERE id_producto = $1 AND estado = 'ACTIVO'",
      [idProducto],
    );
    if (!producto.rowCount) throw new ApiError(400, "El producto no existe o está inactivo");
    if (idLote !== null) {
      const lote = await client.query(
        `SELECT id_lote FROM lotes_productos
         WHERE id_lote = $1 AND id_producto = $2 AND id_almacen = $3`,
        [idLote, idProducto, inv.rows[0].id_almacen],
      );
      if (!lote.rowCount) {
        throw new ApiError(400, "El lote no corresponde al producto y almacén del inventario");
      }
    }

    const stock = await client.query(
      `SELECT cantidad FROM stock
       WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
      [idProducto, inv.rows[0].id_almacen],
    );
    const cantidadSistema = stock.rowCount ? Number(stock.rows[0].cantidad) : 0;
    const existente = await client.query(
      `SELECT id_detalle FROM detalle_inventario_fisico
       WHERE id_inventario = $1 AND id_producto = $2
         AND id_lote IS NOT DISTINCT FROM $3
       FOR UPDATE`,
      [idInventario, idProducto, idLote],
    );

    let result;
    if (existente.rowCount) {
      result = await client.query(
        `UPDATE detalle_inventario_fisico
         SET cantidad_sistema = $1, cantidad_fisica = $2
         WHERE id_detalle = $3 RETURNING *`,
        [cantidadSistema, cantidadFisica, existente.rows[0].id_detalle],
      );
    } else {
      result = await client.query(
        `INSERT INTO detalle_inventario_fisico
          (id_inventario, id_producto, id_lote, cantidad_sistema, cantidad_fisica)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [idInventario, idProducto, idLote, cantidadSistema, cantidadFisica],
      );
    }
    if (inv.rows[0].estado === "PROGRAMADO") {
      await client.query(
        `UPDATE inventarios_fisicos
         SET estado = 'EN_CONTEO', fecha_inicio = CURRENT_TIMESTAMP
         WHERE id_inventario = $1`,
        [idInventario],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const obtenerComparativa = asyncHandler(async (req, res) => {
  const { id_inventario } = req.params;
  const result = await db.query(
    `SELECT d.*, p.nombre AS producto, p.codigo 
     FROM detalle_inventario_fisico d
     INNER JOIN productos p ON p.id_producto = d.id_producto 
     WHERE d.id_inventario = $1`,
    [id_inventario]
  );
  res.json({ ok: true, data: result.rows });
});

/**
 * GET /api/inventarios/:id_inventario/diferencias
 * Devuelve solo los productos con diferencia != 0, clasificados.
 */
const obtenerDiferencias = asyncHandler(async (req, res) => {
  const { id_inventario } = req.params;
  const result = await db.query(
    `SELECT d.*, p.nombre AS producto, p.codigo,
            CASE 
              WHEN d.diferencia > 0 THEN 'SOBRANTE' 
              WHEN d.diferencia < 0 THEN 'FALTANTE' 
              ELSE 'CONFORME' 
            END AS tipo_diferencia
     FROM detalle_inventario_fisico d
     INNER JOIN productos p ON p.id_producto = d.id_producto
     WHERE d.id_inventario = $1 AND d.diferencia != 0
     ORDER BY ABS(d.diferencia) DESC`,
    [id_inventario]
  );
  res.json({ ok: true, data: result.rows });
});

module.exports = {
  crearInventario,
  listarInventarios,
  registrarConteo,
  obtenerComparativa,
  obtenerDiferencias // <-- NUEVA
};