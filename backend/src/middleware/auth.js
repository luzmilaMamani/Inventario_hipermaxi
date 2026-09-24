const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/apiError');

function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Token no enviado'));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (_error) {
    return next(new ApiError(401, 'Token invalido o expirado'));
  }
}

function authorizeRoles(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return next(new ApiError(403, 'No tienes permiso para realizar esta accion'));
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorizeRoles
};
