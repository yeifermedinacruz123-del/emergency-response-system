/**
 * Autenticacion y autorizacion.
 *
 * authenticate      - exige un accessToken valido y carga el usuario real.
 * optionalAuth      - carga el usuario si hay token, pero no falla si no lo hay.
 * authorize(roles)  - exige que el usuario tenga uno de los roles indicados.
 *
 * Por que se consulta la base de datos en cada peticion: el token es valido
 * hasta que expira, asi que si un administrador desactiva a un usuario, ese
 * usuario seguiria entrando con su token viejo. Releer `is_active` cierra esa
 * ventana. Es una consulta por id, indexada, y a cambio la revocacion es
 * inmediata.
 */

'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/user.model');

/** Extrae el token de la cabecera "Authorization: Bearer xxx". */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifica el token y deja en req.user el usuario de la base de datos.
 * Lanza 401 si no hay token, si es invalido o si el usuario esta desactivado.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Debes iniciar sesion para acceder a este recurso');
  }

  // Si el token es invalido o expiro, jsonwebtoken lanza y el middleware de
  // errores lo traduce a 401 con un mensaje entendible.
  const payload = verifyAccessToken(token);

  const user = await userModel.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('La cuenta asociada a la sesion ya no existe');
  if (!user.is_active) throw ApiError.forbidden('Tu cuenta esta desactivada');

  req.user = user;
  req.token = token;
  return next();
});

/**
 * Igual que authenticate, pero no falla cuando no hay token.
 * Se usa donde la respuesta cambia si hay sesion, sin exigirla.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await userModel.findById(payload.sub);
    if (user && user.is_active) {
      req.user = user;
      req.token = token;
    }
  } catch {
    // Token invalido: se sigue como usuario anonimo.
  }

  return next();
});

/**
 * Restringe una ruta a ciertos roles.
 * Uso:  router.get('/', authenticate, authorize(ROLES.ADMINISTRADOR), handler)
 *
 * @param {...string} allowedRoles Codigos de rol permitidos.
 */
function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Debes iniciar sesion para acceder a este recurso'));
    }

    if (!roles.includes(req.user.role_code)) {
      return next(
        ApiError.forbidden('Tu rol no tiene permiso para realizar esta accion')
      );
    }

    return next();
  };
}

module.exports = { authenticate, optionalAuth, authorize };
