/**
 * Puente entre express-validator y el formato de error del sistema.
 *
 * Las reglas se declaran en src/validators/. Este middleware se pone despues de
 * ellas y convierte los fallos en un unico error 422 con el detalle por campo,
 * para que el frontend pueda pintar el mensaje debajo de cada input.
 */

'use strict';

const { validationResult } = require('express-validator');

const ApiError = require('../utils/ApiError');

/** Ejecuta las reglas previas y corta la peticion si alguna fallo. */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((error) => ({
    field: error.path || error.param,
    message: error.msg,
  }));

  return next(ApiError.validation(errors));
}

module.exports = validate;
