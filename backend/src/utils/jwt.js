/**
 * Generacion y verificacion de tokens JWT.
 *
 * Se usan dos tokens distintos:
 *   accessToken  - corto (15 min). Viaja en cada peticion. NO se guarda en la
 *                  base de datos: se valida solo con la firma.
 *   refreshToken - largo (7 dias). Sirve para pedir un accessToken nuevo. SI se
 *                  guarda (hasheado) en refresh_tokens para poder revocarlo.
 *
 * Cada token se firma con un secreto distinto: si se filtra el de acceso, no
 * sirve para fabricar tokens de refresco.
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { config } = require('../config/env');

/**
 * Construye el contenido del token.
 * Solo lleva lo imprescindible: nunca datos sensibles ni la contrasena.
 *
 * @param {{id: number, email: string, role_code: string}} user
 */
function buildPayload(user) {
  return {
    sub: user.id,
    email: user.email,
    role: user.role_code,
  };
}

/** Token de acceso, de vida corta. */
function signAccessToken(user) {
  return jwt.sign(buildPayload(user), config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'ers-api',
  });
}

/**
 * Token de refresco, de vida larga.
 *
 * El `jti` aleatorio no es decorativo: sin el, dos tokens emitidos para el
 * mismo usuario dentro del MISMO segundo salen identicos (igual payload, igual
 * iat, igual exp, igual firma). Como en refresh_tokens el hash es UNIQUE, la
 * segunda insercion fallaba con 409. Pasaba al renovar la sesion justo despues
 * de iniciarla. El jti garantiza que cada token sea distinto.
 */
function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, jti: crypto.randomUUID() },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'ers-api',
    }
  );
}

/** Verifica un token de acceso. Lanza si es invalido o expiro. */
function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, { issuer: 'ers-api' });
}

/** Verifica un token de refresco. Lanza si es invalido o expiro. */
function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret, { issuer: 'ers-api' });
}

/**
 * Hash del token de refresco para guardarlo en la base de datos.
 * Se usa SHA-256 (no bcrypt) porque el token ya es un valor aleatorio largo:
 * no hace falta un algoritmo lento contra fuerza bruta, y asi la busqueda por
 * hash puede usar un indice UNIQUE.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Fecha de expiracion de un token ya firmado, como objeto Date. */
function getExpiration(token) {
  const decoded = jwt.decode(token);
  return decoded && decoded.exp ? new Date(decoded.exp * 1000) : null;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  getExpiration,
};
