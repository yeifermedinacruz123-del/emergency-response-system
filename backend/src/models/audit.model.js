/**
 * Registro de auditoria de las acciones sensibles.
 *
 * Se escribe SIEMPRE sin bloquear la respuesta al usuario: si la auditoria
 * falla, la operacion principal ya ocurrio y no tiene sentido devolver un error
 * por no haber podido anotarla. Por eso `record` no lanza.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');
const logger = require('../config/logger');

/**
 * Anota una accion.
 *
 * @param {object} entry
 * @param {number|null} entry.userId
 * @param {string} entry.action    ver AUDIT_ACTIONS en config/constants
 * @param {string} [entry.entity]  tabla afectada
 * @param {number} [entry.entityId]
 * @param {string} [entry.description]
 * @param {object} [entry.metadata]
 * @param {object} [req]           para tomar IP y navegador
 */
async function record(entry, req = null) {
  try {
    await query(
      `INSERT INTO audit_logs
         (user_id, action, entity, entity_id, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.entity ?? null,
        entry.entityId ?? null,
        entry.description ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        req ? req.ip : null,
        req ? String(req.headers['user-agent'] || '').slice(0, 200) : null,
      ]
    );
  } catch (error) {
    logger.error(`No se pudo registrar la auditoria (${entry.action})`, error.message);
  }
}

/** Listado con filtros por usuario, accion, entidad y rango de fechas. */
async function list(filters = {}, pagination = {}) {
  const conditions = [];
  const params = [];

  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  if (filters.userId) add('a.user_id = ?', filters.userId);
  if (filters.action) add('a.action = ?', filters.action);
  if (filters.entity) add('a.entity = ?', filters.entity);
  if (filters.from) add('a.created_at >= ?', filters.from);
  if (filters.to) add('a.created_at <= ?', filters.to);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
    params
  );

  const items = await queryAll(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.description, a.metadata,
            a.ip_address, a.created_at,
            a.user_id,
            CASE WHEN a.user_id IS NULL THEN 'Sistema'
                 ELSE u.first_name || ' ' || u.last_name END AS user_name,
            r.code AS user_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items, total: totalRow ? totalRow.total : 0 };
}

module.exports = { record, list };
