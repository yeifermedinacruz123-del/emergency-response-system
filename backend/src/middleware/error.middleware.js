/**
 * Manejo centralizado de errores.
 *
 * notFoundHandler  -> ninguna ruta coincidio (404)
 * errorHandler     -> ultimo middleware: convierte cualquier error en JSON
 *
 * Regla de seguridad: en produccion nunca se devuelve el stack ni el detalle
 * interno de PostgreSQL al cliente.
 */

'use strict';

const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const logger = require('../config/logger');
const { config } = require('../config/env');

/** Ruta inexistente. */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`La ruta ${req.method} ${req.originalUrl} no existe`));
}

/**
 * Traduce los errores propios de PostgreSQL a errores de aplicacion
 * con un mensaje entendible.
 */
function translateDatabaseError(error) {
  switch (error.code) {
    case '23505': // unique_violation
      return ApiError.conflict('Ya existe un registro con esos datos', {
        errors: [{ field: error.constraint || 'desconocido', message: 'Valor duplicado' }],
      });
    case '23503': // foreign_key_violation
      return ApiError.badRequest('El registro referenciado no existe o esta en uso');
    case '23502': // not_null_violation
      return ApiError.badRequest(`El campo "${error.column}" es obligatorio`);
    case '23514': // check_violation
      return ApiError.badRequest('Uno de los valores enviados no es valido');
    case '22P02': // invalid_text_representation
      return ApiError.badRequest('Formato de dato invalido');
    case '42P01': // undefined_table
      return new ApiError(503, 'La base de datos aun no tiene el esquema cargado', {
        code: 'DB_SCHEMA_MISSING',
      });
    case 'ECONNREFUSED':
    case '57P03':
      return new ApiError(503, 'No hay conexion con la base de datos', {
        code: 'DB_UNAVAILABLE',
      });
    default:
      return null;
  }
}

/* eslint-disable no-unused-vars */
function errorHandler(error, req, res, next) {
  let apiError = error;

  if (!(apiError instanceof ApiError)) {
    const dbError = translateDatabaseError(error);
    if (dbError) {
      apiError = dbError;
    } else if (error.name === 'JsonWebTokenError') {
      apiError = ApiError.unauthorized('Token invalido');
    } else if (error.name === 'TokenExpiredError') {
      apiError = ApiError.unauthorized('La sesion expiro, inicia sesion de nuevo');
    } else if (error.type === 'entity.parse.failed') {
      apiError = ApiError.badRequest('El cuerpo de la peticion no es un JSON valido');
    } else if (error.code === 'LIMIT_FILE_SIZE') {
      apiError = ApiError.badRequest('El archivo supera el tamano maximo permitido');
    } else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      apiError = ApiError.badRequest('Se enviaron mas archivos de los permitidos');
    } else {
      apiError = ApiError.internal(
        config.isProduction ? 'Error interno del servidor' : error.message
      );
    }
  }

  const level = apiError.statusCode >= 500 ? 'error' : 'warn';
  logger[level](
    `${apiError.statusCode} ${req.method} ${req.originalUrl} - ${apiError.message}`,
    config.isProduction ? undefined : error.stack
  );

  return ApiResponse.error(
    res,
    apiError.statusCode,
    apiError.message,
    apiError.errors,
    apiError.code
  );
}
/* eslint-enable no-unused-vars */

module.exports = { notFoundHandler, errorHandler };
