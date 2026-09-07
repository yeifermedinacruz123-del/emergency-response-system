/**
 * Bitacora de la emergencia (linea de tiempo).
 *
 * Tabla SOLO DE INSERCION: no hay update ni delete a proposito. Si un dato del
 * historial se pudiera corregir, dejaria de servir como evidencia de lo que
 * paso y cuando.
 */

'use strict';

const { query, queryAll } = require('../database');

/**
 * Registra un evento.
 *
 * @param {object} entry
 * @param {number} entry.emergencyId
 * @param {number|null} entry.userId   null = accion automatica del sistema
 * @param {number|null} entry.statusId estado en el que queda la emergencia
 * @param {string} entry.action        ver HISTORY_ACTIONS en config/constants
 * @param {string} entry.description   texto que se muestra en la interfaz
 * @param {object} [entry.metadata]    valores anterior/nuevo, en JSONB
 * @param {import('pg').PoolClient} [client]
 */
async function add(entry, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO emergency_history
       (emergency_id, user_id, status_id, action, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      entry.emergencyId,
      entry.userId ?? null,
      entry.statusId ?? null,
      entry.action,
      entry.description,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );

  return result.rows[0];
}

/** Linea de tiempo completa, en orden cronologico. */
async function findByEmergency(emergencyId) {
  return queryAll(
    `SELECT h.id, h.action, h.description, h.metadata, h.created_at,
            h.user_id,
            CASE WHEN h.user_id IS NULL
                 THEN 'Sistema'
                 ELSE u.first_name || ' ' || u.last_name END AS user_name,
            r.code AS user_role,
            h.status_id, s.code AS status_code, s.name AS status_name, s.color AS status_color
       FROM emergency_history h
       LEFT JOIN users u            ON u.id = h.user_id
       LEFT JOIN roles r            ON r.id = u.role_id
       LEFT JOIN emergency_status s ON s.id = h.status_id
      WHERE h.emergency_id = $1
      ORDER BY h.created_at ASC, h.id ASC`,
    [emergencyId]
  );
}

module.exports = { add, findByEmergency };
