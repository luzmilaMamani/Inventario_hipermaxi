const { randomBytes } = require("node:crypto");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const MOTIVOS = [
  "CONTEO_FISICO",
  "MERMA",
  "DANO",
  "ERROR_REGISTRO",
  "VENCIMIENTO",
  "OTRO",
];

const CONSULTA_AJUSTE = `
  SELECT
    a.id_ajuste,
    a.numero_ajuste,
    a.fecha_ajuste,
    a.id_almacen,
    a.id_producto,
    a.id_lote,
    a.id_usuario,
    a.cantidad_anterior,
    a.cantidad_nueva,
    (a.cantidad_nueva - a.cantidad_anterior) AS diferencia,
    a.motivo,
    a.comentario,
    a.estado,
    al.codigo AS almacen_codigo,
    al.nombre AS almacen,
    p.codigo AS producto_codigo,
    p.nombre AS producto,
    u.nombre_completo AS usuario,
    ua.nombre_completo AS usuario_aprueba
  FROM ajustes_inventario a
  INNER JOIN almacenes al ON al.id_almacen = a.id_almacen
  INNER JOIN productos p ON p.id_producto = a.id_producto
  LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
  LEFT JOIN usuarios ua ON ua.id_usuario = a.id_usuario_aprueba
`;

function leerEnteroPositivo(valor, mensaje) {
  const numero = Number(valor);
  if (typeof valor === "boolean" || !Number.isSafeInteger(numero) || numero <= 0) {
    throw new ApiError(400, mensaje);
  }
  return numero;
}

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(fechaParseada.getTime()) && fechaParseada.toISOString().slice(0, 10) === fecha;
}

function leerJustificacion(body) {
  const motivo = String(body.motivo || "").trim();
  const comentario = String(body.comentario || "").trim();
  if (!MOTIVOS.includes(motivo)) {
    throw new ApiError(400, "Selecciona un motivo del catálogo");
  }
  if (comentario.length < 5) {
    throw new ApiError(400, "El comentario es obligatorio y debe tener al menos 5 caracteres");
  }
  if (comentario.length > 500) {
    throw new ApiError(400, "El comentario no puede superar 500 caracteres");
  }
  return { motivo, comentario };
}

const listarAjustes = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const page = Math.max(Number(req.query.page || 1), 1);
  const offset = (page - 1) * limit;
  const condiciones = [];
  const valores = [];

  if (req.query.motivo) {
    if (!MOTIVOS.includes(req.query.motivo)) {
      throw new ApiError(400, "El motivo no es válido");
    }
    valores.push(req.query.motivo);
    condiciones.push(`a.motivo = $${valores.length}`);
  }
  if (req.query.id_almacen) {
    const idAlmacen = leerEnteroPositivo(req.query.id_almacen, "El almacén no es válido");
    valores.push(idAlmacen);
    condiciones.push(`a.id_almacen = $${valores.length}`);
  }
  if (req.query.id_producto) {
    const idProducto = leerEnteroPositivo(req.query.id_producto, "El producto no es válido");
    valores.push(idProducto);
    condiciones.push(`a.id_producto = $${valores.length}`);
  }
  if (req.query.id_usuario) {
    const idUsuario = leerEnteroPositivo(req.query.id_usuario, "El responsable no es válido");
    valores.push(idUsuario);
    condiciones.push(
      `(a.id_usuario = $${valores.length} OR a.id_usuario_aprueba = $${valores.length})`,
    );
  }
  for (const [parametro, operador] of [
    ["fecha_desde", ">="],
    ["fecha_hasta", "<"],
  ]) {
    const fecha = req.query[parametro];
    if (!fecha) continue;
    if (!esFechaValida(fecha)) throw new ApiError(400, "La fecha del filtro no es válida");
    valores.push(fecha);
    const expresion =
      operador === "<"
        ? `$${valores.length}::date + INTERVAL '1 day'`
        : `$${valores.length}::date`;
    condiciones.push(`a.fecha_ajuste ${operador} ${expresion}`);
  }
  if (
    req.query.fecha_desde &&
    req.query.fecha_hasta &&
    esFechaValida(req.query.fecha_desde) &&
    esFechaValida(req.query.fecha_hasta) &&
    req.query.fecha_desde > req.query.fecha_hasta
  ) {
    throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
  }
  if (req.query.search) {
    valores.push(`%${String(req.query.search).trim()}%`);
    const parametro = `$${valores.length}`;
    condiciones.push(
      `(a.numero_ajuste ILIKE ${parametro} OR p.nombre ILIKE ${parametro} OR p.codigo ILIKE ${parametro} OR a.comentario ILIKE ${parametro})`,
    );
  }

  const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const [dataResult, countResult] = await Promise.all([
    db.query(
      `${CONSULTA_AJUSTE}
       ${whereSql}
       ORDER BY a.fecha_ajuste DESC, a.id_ajuste DESC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM ajustes_inventario a
       INNER JOIN productos p ON p.id_producto = a.id_producto
       ${whereSql}`,
      valores,
    ),
  ]);

  res.json({
    ok: true,
    data: dataResult.rows,
    pagination: { page, limit, total: countResult.rows[0].total },
  });
});

const obtenerAjuste = asyncHandler(async (req, res) => {
  const idAjuste = leerEnteroPositivo(req.params.id, "El ajuste no es válido");
  const result = await db.query(`${CONSULTA_AJUSTE} WHERE a.id_ajuste = $1`, [idAjuste]);
  if (!result.rowCount) throw new ApiError(404, "Ajuste no encontrado");
  res.json({ ok: true, data: result.rows[0] });
});

const crearAjuste = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "El cuerpo de la solicitud no es válido");
  }

  const idAlmacen = leerEnteroPositivo(req.body.id_almacen, "Debe seleccionar un almacén válido");
  const idProducto = leerEnteroPositivo(req.body.id_producto, "Debe seleccionar un producto válido");
  const cantidadNueva = Number(req.body.cantidad_nueva);
  if (
    req.body.cantidad_nueva === undefined ||
    typeof req.body.cantidad_nueva === "boolean" ||
    !Number.isSafeInteger(cantidadNueva) ||
    cantidadNueva < 0
  ) {
    throw new ApiError(400, "La cantidad nueva debe ser un número entero igual o mayor a 0");
  }
  const { motivo, comentario } = leerJustificacion(req.body);

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");

    const almacen = await cliente.query(
      "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
      [idAlmacen],
    );
    if (!almacen.rowCount) throw new ApiError(400, "El almacén no existe o está inactivo");

    const producto = await cliente.query(
      "SELECT id_producto FROM productos WHERE id_producto = $1 AND estado = 'ACTIVO'",
      [idProducto],
    );
    if (!producto.rowCount) throw new ApiError(400, "El producto no existe o está inactivo");

    const stockResult = await cliente.query(
      `SELECT id_stock, cantidad, cantidad_reservada
       FROM stock
       WHERE id_producto = $1 AND id_almacen = $2
       FOR UPDATE`,
      [idProducto, idAlmacen],
    );

    const cantidadAnterior = stockResult.rowCount ? Number(stockResult.rows[0].cantidad) : 0;
    const reservada = stockResult.rowCount ? Number(stockResult.rows[0].cantidad_reservada || 0) : 0;
    if (cantidadNueva === cantidadAnterior) {
      throw new ApiError(400, "La cantidad nueva es igual al stock actual; no hay un ajuste que registrar");
    }
    if (cantidadNueva < reservada) {
      throw new ApiError(
        400,
        `La cantidad nueva no puede ser menor que la cantidad reservada (${reservada})`,
      );
    }

    if (stockResult.rowCount) {
      await cliente.query(
        `UPDATE stock
         SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_stock = $2`,
        [cantidadNueva, stockResult.rows[0].id_stock],
      );
    } else {
      await cliente.query(
        `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
         VALUES ($1, $2, $3, 0)`,
        [idProducto, idAlmacen, cantidadNueva],
      );
    }

    const numeroAjuste = `AJU-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const diferencia = Math.abs(cantidadNueva - cantidadAnterior);
    await cliente.query(
      `INSERT INTO movimientos_inventario
        (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
         stock_anterior, stock_nuevo, referencia, observaciones)
       VALUES ($1, $2, $3, 'AJUSTE', $4, $5, $6, $7, $8)`,
      [
        idProducto,
        idAlmacen,
        req.user.id_usuario,
        diferencia,
        cantidadAnterior,
        cantidadNueva,
        numeroAjuste,
        comentario,
      ],
    );

    const ajuste = await cliente.query(
      `INSERT INTO ajustes_inventario
        (numero_ajuste, id_almacen, id_producto, id_usuario, id_usuario_aprueba,
         cantidad_anterior, cantidad_nueva, motivo, comentario, estado, fecha_ajuste)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, 'APLICADO', CURRENT_TIMESTAMP)
       RETURNING id_ajuste`,
      [
        numeroAjuste,
        idAlmacen,
        idProducto,
        req.user.id_usuario,
        cantidadAnterior,
        cantidadNueva,
        motivo,
        comentario,
      ],
    );

    await cliente.query("COMMIT");
    const detalle = await db.query(`${CONSULTA_AJUSTE} WHERE a.id_ajuste = $1`, [
      ajuste.rows[0].id_ajuste,
    ]);
    res.status(201).json({
      ok: true,
      message: "Ajuste aplicado. La justificación quedó registrada y no se puede modificar.",
      data: detalle.rows[0],
    });
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error al revertir el ajuste de inventario:", rollbackError);
    }
    throw error;
  } finally {
    cliente.release();
  }
});

const rechazarCambio = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, "Una justificación de ajuste registrada no puede modificarse ni eliminarse");
});

module.exports = {
  MOTIVOS,
  listarAjustes,
  obtenerAjuste,
  crearAjuste,
  rechazarCambio,
};
