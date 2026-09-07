/**
 * Contactos de confianza de un ciudadano.
 * Se avisan por correo cuando ese ciudadano activa el boton SOS.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');

async function listByUser(userId) {
  return queryAll(
    `SELECT id, full_name, email, phone, created_at
       FROM trusted_contacts
      WHERE user_id = $1
      ORDER BY created_at`,
    [userId]
  );
}

async function countByUser(userId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM trusted_contacts WHERE user_id = $1',
    [userId]
  );
  return row ? Number(row.total) : 0;
}

async function create({ userId, fullName, email, phone }) {
  const result = await query(
    `INSERT INTO trusted_contacts (user_id, full_name, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, email, phone, created_at`,
    [userId, fullName, email || null, phone || null]
  );
  return result.rows[0];
}

/** Solo borra si el contacto es del propio usuario. */
async function remove(id, userId) {
  const result = await query(
    'DELETE FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rowCount > 0;
}

module.exports = { listByUser, countByUser, create, remove };
