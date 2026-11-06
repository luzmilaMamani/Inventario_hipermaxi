const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const DIAS_MAXIMOS = 365;

function leerDias(valor) {
  const dias = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  if (typeof dias !== "number" || !Number.isSafeInteger(dias) || dias <= 0) {
    throw new ApiError(400, "Los días de anticipación deben ser un entero mayor a cero");
  }
  if (dias > DIAS_MAXIMOS) {
    throw new ApiError(400, `Los días de anticipación no pueden superar ${DIAS_MAXIMOS}`);
  }
  return dias;
}

function leerIdCategoria(valor) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(400, "La categoría no es válida");
  }
  return id;
}

async function obtenerGeneral() {
  const { rows } = await db.query(
    `SELECT dias_anticipacion, fecha_actualizacion
     FROM parametro_vencimiento_general
     WHERE id_parametro = 1`,
  );
  return rows[0] || { dias_anticipacion: 30, fecha_actualizacion: null };
}

const listarParametros = asyncHandler(async (_req, res) => {
  const [general, categorias] = await Promise.all([
    obtenerGeneral(),
    db.query(
      `SELECT
         c.id_categoria,
         c.nombre AS categoria,
         c.activo,
         pvc.dias_anticipacion,
         pvc.fecha_actualizacion,
         fn_dias_anticipacion_vencimiento(c.id_categoria) AS dias_aplicados,
         (pvc.id_categoria IS NULL) AS usa_general
       FROM categorias c
       LEFT JOIN parametros_vencimiento_categoria pvc
         ON pvc.id_categoria = c.id_categoria
       ORDER BY c.nombre ASC`,
    ),
  ]);

  res.json({ ok: true, data: { general, categorias: categorias.rows } });
});

const actualizarGeneral = asyncHandler(async (req, res) => {
  const dias = leerDias(req.body?.dias_anticipacion);
  const { rows } = await db.query(
    `INSERT INTO parametro_vencimiento_general (id_parametro, dias_anticipacion, id_usuario)
     VALUES (1, $1, $2)
     ON CONFLICT (id_parametro) DO UPDATE
       SET dias_anticipacion = EXCLUDED.dias_anticipacion,
           id_usuario = EXCLUDED.id_usuario,
           fecha_actualizacion = CURRENT_TIMESTAMP
     RETURNING dias_anticipacion, fecha_actualizacion`,
    [dias, req.user?.id_usuario || null],
  );

  res.json({
    ok: true,
    message: "Valor general de anticipación actualizado",
    data: rows[0],
  });
});

const guardarCategoria = asyncHandler(async (req, res) => {
  const idCategoria = leerIdCategoria(req.params.id_categoria);
  const dias = leerDias(req.body?.dias_anticipacion);

  const categoria = await db.query(
    "SELECT id_categoria, nombre FROM categorias WHERE id_categoria = $1",
    [idCategoria],
  );
  if (!categoria.rowCount) throw new ApiError(404, "Categoría no encontrada");

  const { rows } = await db.query(
    `INSERT INTO parametros_vencimiento_categoria (id_categoria, dias_anticipacion, id_usuario)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_categoria) DO UPDATE
       SET dias_anticipacion = EXCLUDED.dias_anticipacion,
           id_usuario = EXCLUDED.id_usuario,
           fecha_actualizacion = CURRENT_TIMESTAMP
     RETURNING id_categoria, dias_anticipacion, fecha_actualizacion`,
    [idCategoria, dias, req.user?.id_usuario || null],
  );

  res.json({
    ok: true,
    message: `Anticipación de "${categoria.rows[0].nombre}" actualizada`,
    data: { ...rows[0], categoria: categoria.rows[0].nombre, usa_general: false },
  });
});

const eliminarCategoria = asyncHandler(async (req, res) => {
  const idCategoria = leerIdCategoria(req.params.id_categoria);
  const resultado = await db.query(
    "DELETE FROM parametros_vencimiento_categoria WHERE id_categoria = $1",
    [idCategoria],
  );
  if (!resultado.rowCount) {
    throw new ApiError(404, "La categoría no tiene un valor propio configurado");
  }
  const general = await obtenerGeneral();

  res.json({
    ok: true,
    message: "La categoría vuelve a usar el valor general",
    data: {
      id_categoria: idCategoria,
      dias_anticipacion: null,
      dias_aplicados: general.dias_anticipacion,
      usa_general: true,
    },
  });
});

module.exports = {
  listarParametros,
  actualizarGeneral,
  guardarCategoria,
  eliminarCategoria,
};
