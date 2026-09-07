/**
 * Envoltorio para controladores asincronos.
 *
 * Express 4 no captura los errores de una promesa rechazada. En vez de escribir
 * un try/catch en cada controlador, se envuelve la funcion y cualquier error
 * llega automaticamente al middleware centralizado de errores.
 *
 * Uso:
 *   router.get('/', asyncHandler(controller.list));
 */

'use strict';

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
