/**
 * Error de aplicacion con codigo HTTP.
 *
 * Los servicios lanzan ApiError en lugar de responder directamente: asi la
 * capa de servicios no depende de Express y el middleware de errores puede
 * construir siempre la misma respuesta JSON.
 */

'use strict';

class ApiError extends Error {
  /**
   * @param {number} statusCode Codigo HTTP (400, 401, 403, 404, 409, 422...)
   * @param {string} message    Mensaje legible para el usuario final.
   * @param {object} [options]
   * @param {Array}  [options.errors] Detalle por campo: [{ field, message }]
   * @param {string} [options.code]   Codigo interno: VALIDATION_ERROR, etc.
   */
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = options.errors || [];
    this.code = options.code || null;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Peticion invalida', options) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...options });
  }

  static unauthorized(message = 'No autenticado', options) {
    return new ApiError(401, message, { code: 'UNAUTHORIZED', ...options });
  }

  static forbidden(message = 'No tienes permisos para realizar esta accion', options) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...options });
  }

  static notFound(message = 'Recurso no encontrado', options) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...options });
  }

  static conflict(message = 'El recurso ya existe', options) {
    return new ApiError(409, message, { code: 'CONFLICT', ...options });
  }

  static validation(errors = [], message = 'Los datos enviados no son validos') {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', errors });
  }

  static tooManyRequests(message = 'Demasiadas peticiones, intenta mas tarde') {
    return new ApiError(429, message, { code: 'RATE_LIMIT' });
  }

  static internal(message = 'Error interno del servidor') {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR' });
  }
}

module.exports = ApiError;
