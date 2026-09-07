/**
 * Mensajes del chat de una emergencia (centro de control <-> personal asignado).
 */

'use strict';

const { query, queryAll } = require('../database');

async function create({ emergencyId, senderId, message }) {
  const result = await query(
    `INSERT INTO emergency_messages (emergency_id, sender_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, emergency_id, sender_id, message, created_at`,
    [emergencyId, senderId, message]
  );
  return result.rows[0];
}

async function findByEmergency(emergencyId) {
  return queryAll(
    `SELECT m.id, m.emergency_id, m.sender_id, m.message, m.created_at,
            u.first_name || ' ' || u.last_name AS sender_name, u.role_id,
            r.code AS sender_role_code
       FROM emergency_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE m.emergency_id = $1
      ORDER BY m.created_at`,
    [emergencyId]
  );
}

module.exports = { create, findByEmergency };
