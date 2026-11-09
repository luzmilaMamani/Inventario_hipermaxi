const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const ROLES_CUARENTENA = ["SUPERVISOR", "ADMINISTRADOR"];
const ESTADOS_VIGENTES = ["DISPONIBLE", "PROXIMO_A_VENCER"];

// Un lote cuya fecha ya pasó se muestra vencido aunque el proceso aún no lo marcó.
const ESTADO_VISIBLE = `
  CASE
    WHEN lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
         AND lp.fecha_vencimiento IS NOT NULL
         AND lp.fecha_vencimiento <= CURRENT_DATE THEN 'VENCIDO'
    WHEN lp.estado = 'PROXIMO_A_VENCER' THEN 'DISPONIBLE'
    ELSE lp.estado
  END`;

function leerId(valor, mensaje) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, mensaje);
  return id;
}

function leerMotivo(body) {
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 5) throw new ApiError(400, "Indica el motivo (mínimo 5 caracteres)");
  if (motivo.length > 500) throw new ApiError(400, "El motivo no puede superar los 500 caracteres");
  return motivo;
}

function exigirRolCuarentena(req) {
  if (!ROLES_CUARENTENA.includes(req.user?.rol)) {
    throw new ApiError(403, "Solo un supervisor o administrador puede bloquear o liberar lotes");
  }
}

const listarLotes = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const page = Math.max(Number(req.query.page || 1), 1);
  const condiciones = ["lp.cantidad_actual > 0"];
  const valores = [];

  if (req.query.id_almacen) {
    valores.push(leerId(req.query.id_almacen, "El almacén no es válido"));
    condiciones.push(`lp.id_almacen = $${valores.length}`);
  }
  if (req.query.estado) {
    if (!["DISPONIBLE", "VENCIDO", "CUARENTENA", "BLOQUEADO"].includes(req.query.estado)) {
      throw new ApiError(400, "El estado del lote no es válido");
    }
    valores.push(req.query.estado);
    condiciones.push(`(${ESTADO_VISIBLE}) = $${valores.length}`);
  }
  if (req.query.search) {
    valores.push(`%${String(req.query.search).trim()}%`);
    const parametro = `$${valores.length}`;
    condiciones.push(
      `(p.nombre ILIKE ${parametro} OR p.codigo ILIKE ${parametro} OR lp.numero_lote ILIKE ${parametro})`,
    );
  }

  const fromSql = `
    FROM lotes_productos lp
    INNER JOIN productos p ON p.id_producto = lp.id_producto
    INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
    LEFT JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    WHERE ${condiciones.join(" AND ")}`;

  const [datos, total] = await Promise.all([
    db.query(
      `SELECT
         lp.id_lote,
         lp.numero_lote,
         TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         lp.cantidad_actual AS cantidad,
         ${ESTADO_VISIBLE} AS estado,
         p.id_producto,
         p.codigo AS producto_codigo,
         p.nombre AS producto,
         um.abreviatura AS unidad,
         a.id_almacen,
         a.nombre AS almacen
       ${fromSql}
       ORDER BY (lp.estado = 'CUARENTENA') DESC, lp.fecha_vencimiento ASC NULLS LAST, lp.id_lote ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limit, (page - 1) * limit],
    ),
    db.query(`SELECT COUNT(*)::int AS total ${fromSql}`, valores),
  ]);

  res.json({ ok: true, data: datos.rows, pagination: { page, limit, total: total.rows[0].total } });
});

const historialCuarentena = asyncHandler(async (req, res) => {
  const idLote = leerId(req.params.id, "El lote no es válido");
  const { rows } = await db.query(
    `SELECT h.id_historial, h.accion, h.motivo, h.cantidad, h.fecha,
            u.nombre_completo AS usuario
     FROM historial_cuarentena_lotes h
     INNER JOIN usuarios u ON u.id_usuario = h.id_usuario
     WHERE h.id_lote = $1
     ORDER BY h.fecha DESC, h.id_historial DESC`,
    [idLote],
  );
  res.json({ ok: true, data: rows });
});

// Cambia el estado del lote y registra la acción en una sola transacción.
async function cambiarCuarentena(req, { accion, validar, nuevoEstado }) {
  exigirRolCuarentena(req);
  const idLote = leerId(req.params.id, "El lote no es válido");
  const motivo = leerMotivo(req.body);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id_lote, numero_lote, cantidad_actual, estado,
              (fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= CURRENT_DATE) AS vencido
       FROM lotes_productos
       WHERE id_lote = $1
       FOR UPDATE`,
      [idLote],
    );
    const lote = rows[0];
    if (!lote) throw new ApiError(404, "Lote no encontrado");
    validar(lote);

    const actualizado = await client.query(
      "UPDATE lotes_productos SET estado = $1 WHERE id_lote = $2 RETURNING estado",
      [nuevoEstado, idLote],
    );
    await client.query(
      `INSERT INTO historial_cuarentena_lotes (id_lote, accion, motivo, cantidad, id_usuario)
       VALUES ($1, $2, $3, $4, $5)`,
      [idLote, accion, motivo, lote.cantidad_actual, req.user.id_usuario],
    );
    await client.query("COMMIT");
    return { lote, estado: actualizado.rows[0].estado };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const ponerEnCuarentena = asyncHandler(async (req, res) => {
  const { lote, estado } = await cambiarCuarentena(req, {
    accion: "BLOQUEO",
    nuevoEstado: "CUARENTENA",
    validar: (actual) => {
      if (Number(actual.cantidad_actual) <= 0) {
        throw new ApiError(400, "El lote no tiene existencia");
      }
      if (!ESTADOS_VIGENTES.includes(actual.estado) || actual.vencido) {
        throw new ApiError(400, `Solo un lote vigente puede ir a cuarentena; este está ${actual.vencido ? "VENCIDO" : actual.estado}`);
      }
    },
  });
  res.json({
    ok: true,
    message: `Lote ${lote.numero_lote} en cuarentena: no se puede vender ni transferir`,
    data: { id_lote: lote.id_lote, estado },
  });
});

const liberarCuarentena = asyncHandler(async (req, res) => {
  const { lote, estado } = await cambiarCuarentena(req, {
    accion: "LIBERACION",
    nuevoEstado: "DISPONIBLE",
    validar: (actual) => {
      if (actual.estado !== "CUARENTENA") {
        throw new ApiError(400, `El lote no está en cuarentena; está ${actual.estado}`);
      }
    },
  });
  res.json({
    ok: true,
    message:
      estado === "VENCIDO"
        ? `Lote ${lote.numero_lote} liberado, pero venció durante la cuarentena: pasó a vencidos`
        : `Lote ${lote.numero_lote} liberado: vuelve al stock disponible`,
    data: { id_lote: lote.id_lote, estado },
  });
});

module.exports = { listarLotes, historialCuarentena, ponerEnCuarentena, liberarCuarentena };
