const { randomBytes } = require("node:crypto");
const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const {
  bloquearLotes,
  validarAjusteEnLotes,
  aplicarAjusteEnLotes,
} = require("../services/lotesMovimientos");

const MOTIVOS = [
  "CONTEO_FISICO",
  "MERMA",
  "DANO",
  "ERROR_REGISTRO",
  "VENCIMIENTO",
  "OTRO",
];

// RF53: estados del ajuste y roles que pueden decidir los pendientes.
const ESTADOS = ["APLICADO", "PENDIENTE", "APROBADO", "RECHAZADO"];
const ROLES_APROBADORES = ["SUPERVISOR"];

const CONSULTA_AJUSTE = `
  SELECT
    a.id_ajuste,
    a.numero_ajuste,
    a.fecha_ajuste,
    a.id_almacen,
    a.id_producto,
    a.id_lote,
    a.id_usuario,
    a.id_usuario_aprueba,
    a.cantidad_anterior,
    a.cantidad_nueva,
    (a.cantidad_nueva - a.cantidad_anterior) AS diferencia,
    a.motivo,
    a.comentario,
    a.estado,
    a.requiere_aprobacion,
    a.valor_ajuste,
    a.fecha_aprobacion,
    a.motivo_rechazo,
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

function leerNumeroPositivo(valor, mensaje) {
  const numero = Number(valor);
  if (
    valor === undefined ||
    valor === null ||
    valor === "" ||
    typeof valor === "boolean" ||
    !Number.isFinite(numero) ||
    numero <= 0 ||
    numero > 1e10
  ) {
    throw new ApiError(400, mensaje);
  }
  return Math.round(numero * 100) / 100;
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

function exigirAprobador(req) {
  if (!ROLES_APROBADORES.includes(req.user?.rol)) {
    throw new ApiError(403, "Solo un supervisor de inventario puede aprobar o rechazar ajustes");
  }
}

async function obtenerParametrosAprobacion(cliente) {
  const result = await cliente.query(
    `SELECT pa.limite_cantidad, pa.limite_monto, pa.fecha_actualizacion,
            u.nombre_completo AS usuario_actualiza
     FROM parametros_aprobacion_ajuste pa
     LEFT JOIN usuarios u ON u.id_usuario = pa.id_usuario_actualiza
     WHERE pa.id_parametro = 1`,
  );
  const fila = result.rows[0] || { limite_cantidad: 50, limite_monto: 1000 };
  return {
    limite_cantidad: Number(fila.limite_cantidad),
    limite_monto: Number(fila.limite_monto),
    fecha_actualizacion: fila.fecha_actualizacion || null,
    usuario_actualiza: fila.usuario_actualiza || null,
  };
}

// RF53: el ajuste requiere aprobación si la diferencia en unidades o su valor
// (diferencia x precio) supera el límite configurado.
function evaluarLimite({ diferencia, precio }, limites) {
  const valor = Math.round(diferencia * precio * 100) / 100;
  const superaCantidad = diferencia > limites.limite_cantidad;
  const superaMonto = valor > limites.limite_monto;
  return { valor, superaCantidad, superaMonto, requiereAprobacion: superaCantidad || superaMonto };
}

// Aplica la cantidad nueva al stock y registra el movimiento AJUSTE.
async function aplicarEnStock(cliente, { idProducto, idAlmacen, idStock, cantidadAnterior, cantidadNueva, idUsuario, numeroAjuste, comentario, fechaVencimiento }) {
  await aplicarAjusteEnLotes(cliente, {
    idProducto,
    idAlmacen,
    diferencia: cantidadNueva - cantidadAnterior,
    numeroAjuste,
    fechaVencimiento,
  });

  if (idStock) {
    await cliente.query(
      `UPDATE stock
       SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id_stock = $2`,
      [cantidadNueva, idStock],
    );
  } else {
    await cliente.query(
      `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
       VALUES ($1, $2, $3, 0)`,
      [idProducto, idAlmacen, cantidadNueva],
    );
  }

  await cliente.query(
    `INSERT INTO movimientos_inventario
      (id_producto, id_almacen, id_usuario, tipo_movimiento, cantidad,
       stock_anterior, stock_nuevo, referencia, observaciones)
     VALUES ($1, $2, $3, 'AJUSTE', $4, $5, $6, $7, $8)`,
    [
      idProducto,
      idAlmacen,
      idUsuario,
      Math.abs(cantidadNueva - cantidadAnterior),
      cantidadAnterior,
      cantidadNueva,
      numeroAjuste,
      comentario,
    ],
  );
}

async function bloquearStock(cliente, idProducto, idAlmacen) {
  const stockResult = await cliente.query(
    `SELECT id_stock, cantidad, cantidad_reservada
     FROM stock
     WHERE id_producto = $1 AND id_almacen = $2
     FOR UPDATE`,
    [idProducto, idAlmacen],
  );
  const fila = stockResult.rows[0];
  return {
    idStock: fila ? fila.id_stock : null,
    cantidad: fila ? Number(fila.cantidad) : 0,
    reservada: fila ? Number(fila.cantidad_reservada || 0) : 0,
  };
}

async function revertir(cliente, contexto) {
  try {
    await cliente.query("ROLLBACK");
  } catch (rollbackError) {
    console.error(`Error al revertir ${contexto}:`, rollbackError);
  }
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
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) {
      throw new ApiError(400, "El estado no es válido");
    }
    valores.push(req.query.estado);
    condiciones.push(`a.estado = $${valores.length}`);
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
  // Los pendientes se atienden en orden de llegada; el historial, del más reciente.
  const orden =
    req.query.estado === "PENDIENTE"
      ? "a.fecha_ajuste ASC, a.id_ajuste ASC"
      : "a.fecha_ajuste DESC, a.id_ajuste DESC";
  const [dataResult, countResult] = await Promise.all([
    db.query(
      `${CONSULTA_AJUSTE}
       ${whereSql}
       ORDER BY ${orden}
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
  const fechaRecibida = String(req.body.fecha_vencimiento || "").trim() || null;
  if (fechaRecibida && !esFechaValida(fechaRecibida)) {
    throw new ApiError(400, "La fecha de vencimiento no es válida");
  }

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");

    const almacen = await cliente.query(
      "SELECT id_almacen FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
      [idAlmacen],
    );
    if (!almacen.rowCount) throw new ApiError(400, "El almacén no existe o está inactivo");

    const producto = await cliente.query(
      `SELECT id_producto, COALESCE(precio, 0) AS precio, controla_vencimiento,
              ($2::date IS NULL OR $2::date > CURRENT_DATE) AS fecha_vigente
       FROM productos WHERE id_producto = $1 AND estado = 'ACTIVO'`,
      [idProducto, fechaRecibida],
    );
    if (!producto.rowCount) throw new ApiError(400, "El producto no existe o está inactivo");
    const controlaVencimiento = producto.rows[0].controla_vencimiento === true;
    if (controlaVencimiento && !producto.rows[0].fecha_vigente) {
      throw new ApiError(400, "La fecha de vencimiento debe ser posterior a hoy");
    }
    const fechaVencimiento = controlaVencimiento ? fechaRecibida : null;

    await bloquearLotes(cliente, idProducto, idAlmacen);
    const stock = await bloquearStock(cliente, idProducto, idAlmacen);
    const cantidadAnterior = stock.cantidad;
    if (cantidadNueva === cantidadAnterior) {
      throw new ApiError(400, "La cantidad nueva es igual al stock actual; no hay un ajuste que registrar");
    }
    if (cantidadNueva < stock.reservada) {
      throw new ApiError(
        400,
        `La cantidad nueva no puede ser menor que la cantidad reservada (${stock.reservada})`,
      );
    }

    // Un solo ajuste pendiente por producto y almacén: el siguiente se calcularía
    // sobre un stock que todavía puede cambiar al decidir el primero.
    const pendiente = await cliente.query(
      `SELECT numero_ajuste FROM ajustes_inventario
       WHERE id_producto = $1 AND id_almacen = $2 AND estado = 'PENDIENTE'
       LIMIT 1`,
      [idProducto, idAlmacen],
    );
    if (pendiente.rowCount) {
      throw new ApiError(
        409,
        `Ya existe un ajuste pendiente de aprobación (${pendiente.rows[0].numero_ajuste}) para este producto en este almacén`,
      );
    }

    await validarAjusteEnLotes(cliente, {
      idProducto,
      idAlmacen,
      diferencia: cantidadNueva - cantidadAnterior,
      controlaVencimiento,
      fechaVencimiento,
    });

    const limites = await obtenerParametrosAprobacion(cliente);
    const evaluacion = evaluarLimite(
      {
        diferencia: Math.abs(cantidadNueva - cantidadAnterior),
        precio: Number(producto.rows[0].precio),
      },
      limites,
    );
    const estado = evaluacion.requiereAprobacion ? "PENDIENTE" : "APLICADO";
    const numeroAjuste = `AJU-${Date.now()}-${randomBytes(3).toString("hex")}`;

    // Bajo el límite se aplica de inmediato; sobre el límite el stock no cambia.
    if (estado === "APLICADO") {
      await aplicarEnStock(cliente, {
        idProducto,
        idAlmacen,
        idStock: stock.idStock,
        cantidadAnterior,
        cantidadNueva,
        idUsuario: req.user.id_usuario,
        numeroAjuste,
        comentario,
        fechaVencimiento,
      });
    }

    const ajuste = await cliente.query(
      `INSERT INTO ajustes_inventario
        (numero_ajuste, id_almacen, id_producto, id_usuario, id_usuario_aprueba,
         cantidad_anterior, cantidad_nueva, motivo, comentario, estado,
         requiere_aprobacion, valor_ajuste, fecha_vencimiento_lote, fecha_ajuste)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
       RETURNING id_ajuste`,
      [
        numeroAjuste,
        idAlmacen,
        idProducto,
        req.user.id_usuario,
        estado === "APLICADO" ? req.user.id_usuario : null,
        cantidadAnterior,
        cantidadNueva,
        motivo,
        comentario,
        estado,
        evaluacion.requiereAprobacion,
        evaluacion.valor,
        fechaVencimiento,
      ],
    );

    await cliente.query("COMMIT");
    const detalle = await db.query(`${CONSULTA_AJUSTE} WHERE a.id_ajuste = $1`, [
      ajuste.rows[0].id_ajuste,
    ]);

    let message = "Ajuste aplicado. La justificación quedó registrada y no se puede modificar.";
    if (estado === "PENDIENTE") {
      const razones = [];
      if (evaluacion.superaCantidad) {
        razones.push(`la diferencia supera ${limites.limite_cantidad} unidades`);
      }
      if (evaluacion.superaMonto) {
        razones.push(`el monto supera Bs ${limites.limite_monto.toFixed(2)}`);
      }
      message = `El ajuste quedó pendiente de aprobación porque ${razones.join(" y ")}. El stock no cambiará hasta que un supervisor lo apruebe.`;
    }

    res.status(201).json({ ok: true, message, data: detalle.rows[0] });
  } catch (error) {
    await revertir(cliente, "el ajuste de inventario");
    throw error;
  } finally {
    cliente.release();
  }
});

async function bloquearPendiente(cliente, idAjuste) {
  const result = await cliente.query(
    `SELECT id_ajuste, numero_ajuste, id_almacen, id_producto, id_usuario,
            cantidad_anterior, cantidad_nueva, comentario, estado,
            TO_CHAR(fecha_vencimiento_lote, 'YYYY-MM-DD') AS fecha_vencimiento_lote
     FROM ajustes_inventario
     WHERE id_ajuste = $1
     FOR UPDATE`,
    [idAjuste],
  );
  if (!result.rowCount) throw new ApiError(404, "Ajuste no encontrado");
  const ajuste = result.rows[0];
  if (ajuste.estado !== "PENDIENTE") {
    throw new ApiError(409, `El ajuste ya fue decidido (estado ${ajuste.estado})`);
  }
  return ajuste;
}

// RF53: al aprobar se aplica el stock. Si el stock cambió desde que se registró
// el ajuste, no se aprueba a ciegas: debe rechazarse y registrarse otro.
const aprobarAjuste = asyncHandler(async (req, res) => {
  exigirAprobador(req);
  const idAjuste = leerEnteroPositivo(req.params.id, "El ajuste no es válido");

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");
    const ajuste = await bloquearPendiente(cliente, idAjuste);
    if (Number(ajuste.id_usuario) === Number(req.user.id_usuario)) {
      throw new ApiError(403, "No puedes aprobar un ajuste que registraste tú mismo");
    }

    const idProducto = Number(ajuste.id_producto);
    const idAlmacen = Number(ajuste.id_almacen);
    const cantidadAnterior = Number(ajuste.cantidad_anterior);
    const cantidadNueva = Number(ajuste.cantidad_nueva);
    await bloquearLotes(cliente, idProducto, idAlmacen);
    const stock = await bloquearStock(cliente, idProducto, idAlmacen);

    if (stock.cantidad !== cantidadAnterior) {
      throw new ApiError(
        409,
        `El stock cambió desde que se registró el ajuste (antes ${cantidadAnterior}, ahora ${stock.cantidad}). Rechácelo y registre un ajuste nuevo.`,
      );
    }
    if (cantidadNueva < stock.reservada) {
      throw new ApiError(
        409,
        `La cantidad nueva (${cantidadNueva}) es menor que la cantidad reservada actual (${stock.reservada})`,
      );
    }

    // Los lotes vigentes pudieron agotarse mientras el ajuste esperaba aprobación.
    const producto = await cliente.query(
      "SELECT controla_vencimiento FROM productos WHERE id_producto = $1",
      [idProducto],
    );
    await validarAjusteEnLotes(cliente, {
      idProducto,
      idAlmacen,
      diferencia: cantidadNueva - cantidadAnterior,
      controlaVencimiento: producto.rows[0].controla_vencimiento === true,
      fechaVencimiento: ajuste.fecha_vencimiento_lote,
    });

    await aplicarEnStock(cliente, {
      idProducto,
      idAlmacen,
      idStock: stock.idStock,
      cantidadAnterior,
      cantidadNueva,
      idUsuario: req.user.id_usuario,
      numeroAjuste: ajuste.numero_ajuste,
      comentario: `${ajuste.comentario} | Aprobado por supervisor`,
      fechaVencimiento: ajuste.fecha_vencimiento_lote,
    });

    await cliente.query(
      `UPDATE ajustes_inventario
       SET estado = 'APROBADO', id_usuario_aprueba = $1
       WHERE id_ajuste = $2`,
      [req.user.id_usuario, idAjuste],
    );

    await cliente.query("COMMIT");
    const detalle = await db.query(`${CONSULTA_AJUSTE} WHERE a.id_ajuste = $1`, [idAjuste]);
    res.json({
      ok: true,
      message: `Ajuste ${ajuste.numero_ajuste} aprobado y stock actualizado`,
      data: detalle.rows[0],
    });
  } catch (error) {
    await revertir(cliente, "la aprobación del ajuste");
    throw error;
  } finally {
    cliente.release();
  }
});

const rechazarAjuste = asyncHandler(async (req, res) => {
  exigirAprobador(req);
  const idAjuste = leerEnteroPositivo(req.params.id, "El ajuste no es válido");
  const motivoRechazo = String(req.body?.motivo_rechazo || "").trim();
  if (motivoRechazo.length < 5) {
    throw new ApiError(400, "Indica el motivo del rechazo (mínimo 5 caracteres)");
  }
  if (motivoRechazo.length > 500) {
    throw new ApiError(400, "El motivo del rechazo no puede superar 500 caracteres");
  }

  const cliente = await db.pool.connect();
  try {
    await cliente.query("BEGIN");
    const ajuste = await bloquearPendiente(cliente, idAjuste);
    if (Number(ajuste.id_usuario) === Number(req.user.id_usuario)) {
      throw new ApiError(403, "No puedes rechazar un ajuste que registraste tú mismo");
    }

    await cliente.query(
      `UPDATE ajustes_inventario
       SET estado = 'RECHAZADO', id_usuario_aprueba = $1, motivo_rechazo = $2
       WHERE id_ajuste = $3`,
      [req.user.id_usuario, motivoRechazo, idAjuste],
    );

    await cliente.query("COMMIT");
    const detalle = await db.query(`${CONSULTA_AJUSTE} WHERE a.id_ajuste = $1`, [idAjuste]);
    res.json({
      ok: true,
      message: `Ajuste ${ajuste.numero_ajuste} rechazado. El stock no se modificó.`,
      data: detalle.rows[0],
    });
  } catch (error) {
    await revertir(cliente, "el rechazo del ajuste");
    throw error;
  } finally {
    cliente.release();
  }
});

const resumenPendientes = asyncHandler(async (_req, res) => {
  const result = await db.query(
    "SELECT COUNT(*)::int AS pendientes FROM ajustes_inventario WHERE estado = 'PENDIENTE'",
  );
  res.json({ ok: true, data: { pendientes: result.rows[0].pendientes } });
});

const obtenerLimites = asyncHandler(async (_req, res) => {
  res.json({ ok: true, data: await obtenerParametrosAprobacion(db) });
});

// Solo el administrador configura los límites (el middleware de roles bloquea
// a los demás roles en métodos de escritura sobre esta ruta).
const actualizarLimites = asyncHandler(async (req, res) => {
  if (req.user?.rol !== "ADMINISTRADOR") {
    throw new ApiError(403, "Solo un administrador puede configurar los límites de aprobación");
  }
  const limiteCantidad = leerNumeroPositivo(
    req.body?.limite_cantidad,
    "El límite de cantidad debe ser un número mayor a 0",
  );
  const limiteMonto = leerNumeroPositivo(
    req.body?.limite_monto,
    "El límite de monto debe ser un número mayor a 0",
  );

  await db.query(
    `INSERT INTO parametros_aprobacion_ajuste
       (id_parametro, limite_cantidad, limite_monto, fecha_actualizacion, id_usuario_actualiza)
     VALUES (1, $1, $2, CURRENT_TIMESTAMP, $3)
     ON CONFLICT (id_parametro) DO UPDATE
       SET limite_cantidad = EXCLUDED.limite_cantidad,
           limite_monto = EXCLUDED.limite_monto,
           fecha_actualizacion = CURRENT_TIMESTAMP,
           id_usuario_actualiza = EXCLUDED.id_usuario_actualiza`,
    [limiteCantidad, limiteMonto, req.user.id_usuario],
  );

  res.json({
    ok: true,
    message: "Límites de aprobación actualizados",
    data: await obtenerParametrosAprobacion(db),
  });
});

const rechazarCambio = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, "Una justificación de ajuste registrada no puede modificarse ni eliminarse");
});

module.exports = {
  MOTIVOS,
  ESTADOS,
  ROLES_APROBADORES,
  listarAjustes,
  obtenerAjuste,
  crearAjuste,
  aprobarAjuste,
  rechazarAjuste,
  resumenPendientes,
  obtenerLimites,
  actualizarLimites,
  rechazarCambio,
};
