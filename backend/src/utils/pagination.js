/**
 * Utilidades de paginacion y ordenamiento para los listados.
 *
 * El ordenamiento NO se puede parametrizar en SQL ($1 no sirve para nombres de
 * columna), asi que el nombre se concatena. Para que eso sea seguro, la columna
 * SIEMPRE se valida contra una lista blanca: si no esta en la lista, se usa la
 * columna por defecto. Nunca llega texto del usuario directo al SQL.
 */

'use strict';

const { PAGINATION } = require('../config/constants');

/**
 * Normaliza ?page= y ?limit= de la query.
 * @returns {{page: number, limit: number, offset: number}}
 */
function getPagination(query = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isNaN(rawPage) || rawPage < 1 ? PAGINATION.DEFAULT_PAGE : rawPage;

  let limit = Number.isNaN(rawLimit) || rawLimit < 1 ? PAGINATION.DEFAULT_LIMIT : rawLimit;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Traduce ?sort= y ?order= a un fragmento "ORDER BY" seguro.
 *
 * @param {object} query          req.query
 * @param {Object<string,string>} allowed  { clavePublica: 'columna_sql' }
 * @param {string} defaultKey     clave a usar si no llega o no es valida
 * @param {string} defaultOrder   'ASC' | 'DESC'
 * @returns {{column: string, direction: string, clause: string}}
 */
function getSorting(query = {}, allowed = {}, defaultKey, defaultOrder = 'DESC') {
  const requested = String(query.sort || '').trim();
  const column = Object.prototype.hasOwnProperty.call(allowed, requested)
    ? allowed[requested]
    : allowed[defaultKey];

  const direction = String(query.order || '').toUpperCase() === 'ASC' ? 'ASC' : defaultOrder;

  return { column, direction, clause: `ORDER BY ${column} ${direction}` };
}

/**
 * Arma los metadatos que acompañan a un listado paginado.
 * @param {{page:number, limit:number}} pagination
 * @param {number} total
 */
function buildMeta(pagination, total) {
  const totalPages = pagination.limit > 0 ? Math.ceil(total / pagination.limit) : 0;
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages,
    hasNextPage: pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1,
  };
}

module.exports = { getPagination, getSorting, buildMeta };
