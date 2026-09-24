/**
 * Limitadores de peticiones (proteccion contra abuso y fuerza bruta).
 */

'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const { verifyAccessToken } = require('../utils/jwt');

/** Formato de error igual al del resto de la API. */
function buildHandler(message) {
  return (req, res) =>
    res.status(429).json({ success: false, message, code: 'RATE_LIMIT' });
}

/**
 * Clave del limite general: el usuario si trae un token valido, la IP si no.
 *
 * Con solo la IP, todos los que comparten una red (un salon, una oficina, el
 * wifi de una universidad) gastaban el mismo cupo, y cuando uno lo agotaba el
 * sistema dejaba de responder para todos. El token se VERIFICA (firma y
 * vigencia): con uno inventado no se consigue un cupo nuevo, se cuenta por IP.
 */
function userOrIpKey(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      return `user:${verifyAccessToken(header.slice(7).trim()).sub}`;
    } catch {
      // Token invalido o vencido: cuenta como peticion anonima.
    }
  }
  return `ip:${req.ip}`;
}

/**
 * Rutas que el limite general no debe cortar nunca:
 *   - el SOS, que tiene su propio limite (sosLimiter). Antes el general se
 *     aplicaba primero y, agotado, respondia 429 a un SOS aunque el propio
 *     codigo decia que eso no podia pasar;
 *   - /health, que usan los monitores y la pagina de estado.
 */
function isExempt(req) {
  const path = req.originalUrl.split('?')[0];
  return (req.method === 'POST' && path.endsWith('/emergencies/sos')) || path.endsWith('/health');
}

/** Limite general para toda la API. */
const apiLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: isExempt,
  handler: buildHandler('Demasiadas peticiones. Intenta de nuevo en unos minutos.'),
});

/**
 * Intentos fallidos contra UNA cuenta desde una misma IP (login).
 *
 * Es el freno a la fuerza bruta: AUTH_RATE_LIMIT_MAX intentos por ventana.
 * La clave es IP + correo, no solo la IP. Con solo la IP, cinco claves mal
 * escritas por una persona bloqueaban el acceso de TODOS los que comparten
 * esa IP (un salon de clase, una oficina detras del mismo router) durante
 * quince minutos, aunque ellos no hubieran fallado nunca.
 */
const loginLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 120);
    return `${req.ip}|${email}`;
  },
  handler: buildHandler('Demasiados intentos con esta cuenta. Espera unos minutos.'),
});

/**
 * Tope por IP para todo /auth (login, registro, refresco, recuperacion).
 * Mas holgado que el de cada cuenta, pero impide probar muchas cuentas
 * distintas desde el mismo equipo. Tambien cuenta solo los fallos.
 */
const authLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.authMax * 4,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: buildHandler('Demasiados intentos de autenticacion. Espera unos minutos.'),
});

/**
 * El boton SOS no puede quedar bloqueado por el limitador general,
 * pero tampoco debe permitir spam: 10 activaciones cada 15 minutos.
 */
const sosLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Por persona, no por IP: diez vecinos en la misma red deben poder pedir
  // ayuda cada uno, sin agotar entre todos un cupo comun.
  keyGenerator: userOrIpKey,
  handler: buildHandler('Has activado el SOS demasiadas veces. Comunicate con la linea 123.'),
});

module.exports = { apiLimiter, authLimiter, loginLimiter, sosLimiter };
