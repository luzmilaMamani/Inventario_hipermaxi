const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      id_usuario: user.id_usuario,
      nombre_usuario: user.nombre_usuario,
      rol: user.rol
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { nombre_usuario, password } = req.body;

    if (!nombre_usuario || !password) {
      throw new ApiError(400, 'nombre_usuario y password son obligatorios');
    }

    const result = await db.query(
      `SELECT
        u.id_usuario,
        u.id_rol,
        u.nombre_usuario,
        u.nombre_completo,
        u.email,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.nombre_usuario = $1
        AND u.activo = TRUE
        AND u.password_hash = crypt($2, u.password_hash)`,
      [nombre_usuario, password]
    );

    if (!result.rowCount) {
      throw new ApiError(401, 'Credenciales incorrectas');
    }

    const user = result.rows[0];
    await db.query('UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id_usuario = $1', [user.id_usuario]);

    res.json({
      ok: true,
      token: signToken(user),
      user
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT
        u.id_usuario,
        u.id_rol,
        u.nombre_usuario,
        u.nombre_completo,
        u.email,
        u.activo,
        u.ultimo_login,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1`,
      [req.user.id_usuario]
    );

    if (!result.rowCount) {
      throw new ApiError(404, 'Usuario no encontrado');
    }

    res.json({ ok: true, data: result.rows[0] });
  })
);

router.post(
  '/register',
  authenticate,
  authorizeRoles('ADMINISTRADOR'),
  asyncHandler(async (req, res) => {
    const { id_rol, nombre_usuario, password, nombre_completo, email, activo = true } = req.body;

    if (!id_rol || !nombre_usuario || !password || !nombre_completo) {
      throw new ApiError(400, 'id_rol, nombre_usuario, password y nombre_completo son obligatorios');
    }

    const result = await db.query(
      `INSERT INTO usuarios (id_rol, nombre_usuario, password_hash, nombre_completo, email, activo)
      VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6)
      RETURNING id_usuario, id_rol, nombre_usuario, nombre_completo, email, activo, fecha_creacion`,
      [id_rol, nombre_usuario, password, nombre_completo, email || null, activo]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  })
);

router.put(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password_actual, password_nuevo } = req.body;

    if (!password_actual || !password_nuevo) {
      throw new ApiError(400, 'password_actual y password_nuevo son obligatorios');
    }

    const result = await db.query(
      `UPDATE usuarios
      SET password_hash = crypt($2, gen_salt('bf'))
      WHERE id_usuario = $1
        AND password_hash = crypt($3, password_hash)
      RETURNING id_usuario`,
      [req.user.id_usuario, password_nuevo, password_actual]
    );

    if (!result.rowCount) {
      throw new ApiError(401, 'La password actual no es correcta');
    }

    res.json({ ok: true, message: 'Password actualizada correctamente' });
  })
);

module.exports = router;
