/**
 * Limitadores de peticiones (proteccion contra abuso y fuerza bruta).
 */

'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');

/** Formato de error igual al del resto de la API. */
function buildHandler(message) {
  return (req, res) =>
    res.status(429).json({ success: false, message, code: 'RATE_LIMIT' });
}

/** Limite general para toda la API. */
const apiLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildHandler('Demasiadas peticiones desde esta IP. Intenta de nuevo en unos minutos.'),
});

/** Limite estricto para login y registro. */
const authLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.authMax,
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
  handler: buildHandler('Has activado el SOS demasiadas veces. Comunicate con la linea 123.'),
});

module.exports = { apiLimiter, authLimiter, sosLimiter };
