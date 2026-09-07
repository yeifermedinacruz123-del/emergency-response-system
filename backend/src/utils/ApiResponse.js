/**
 * Constructor de respuestas JSON uniformes.
 *
 * Todas las respuestas del sistema tienen la misma forma:
 *   { success, message, data, meta }
 * Esto permite que el frontend tenga un unico manejador de respuestas.
 */

'use strict';

class ApiResponse {
  /** 200 - Operacion correcta. */
  static ok(res, data = null, message = 'Operacion realizada correctamente', meta = null) {
    return ApiResponse.send(res, 200, true, message, data, meta);
  }

  /** 201 - Recurso creado. */
  static created(res, data = null, message = 'Recurso creado correctamente') {
    return ApiResponse.send(res, 201, true, message, data, null);
  }

  /** 204 - Sin contenido. */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * 200 con metadatos de paginacion.
   * @param {object} pagination { page, limit, total }
   */
  static paginated(res, items, pagination, message = 'Listado obtenido correctamente') {
    const { page, limit, total } = pagination;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return ApiResponse.send(res, 200, true, message, items, {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  }

  /** Respuesta de error. La usa el middleware centralizado de errores. */
  static error(res, statusCode, message, errors = [], code = null) {
    const body = { success: false, message };
    if (errors && errors.length > 0) body.errors = errors;
    if (code) body.code = code;
    return res.status(statusCode).json(body);
  }

  /** Metodo base. */
  static send(res, statusCode, success, message, data, meta) {
    const body = { success, message };
    if (data !== null && data !== undefined) body.data = data;
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
  }
}

module.exports = ApiResponse;
