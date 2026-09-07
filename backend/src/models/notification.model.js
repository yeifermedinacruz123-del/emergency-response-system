/**
 * Bandeja de notificaciones por usuario.
 *
 * Es el canal PERSISTENTE: lo que el usuario ve al entrar aunque estuviera
 * desconectado. El canal en vivo (Socket.IO) llega en la Fase 7 y leera de
 * aqui, no lo reemplaza.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');

/** Crea una notificacion para un usuario. */
async function create(data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO notifications (user_id, emergency_id, type, title, message, icon)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, emergency_id, type, title, message, icon, is_read, created_at`,
    [
      data.userId,
      data.emergencyId ?? null,
      data.type,
      data.title,
      data.message,
      data.icon ?? null,
    ]
  );

  return result.rows[0];
}

/**
 * Crea la misma notificacion para varios usuarios (por ejemplo, avisar a todos
 * los operadores de una emergencia nueva). Un solo INSERT en lugar de N.
 */
async function createForMany(userIds = [], data, client = null) {
  if (userIds.length === 0) return [];

  const run = client ? (text, params) => client.query(text, params) : query;
  const params = [data.emergencyId ?? null, data.type, data.title, data.message, data.icon ?? null];

  const values = userIds.map((userId) => {
    params.push(userId);
    return `($${params.length}, $1, $2, $3, $4, $5)`;
  });

  const result = await run(
    `INSERT INTO notifications (user_id, emergency_id, type, title, message, icon)
     VALUES ${values.join(', ')}
     RETURNING id, user_id, emergency_id, type, title, message, icon, is_read, created_at`,
    params
  );

  return result.rows;
}

/** Bandeja paginada del usuario. */
async function listForUser(userId, { onlyUnread = false } = {}, pagination = {}) {
  const params = [userId];
  let where = 'WHERE n.user_id = $1';
  if (onlyUnread) where += ' AND NOT n.is_read';

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM notifications n ${where}`,
    params
  );

  const items = await queryAll(
    `SELECT n.id, n.type, n.title, n.message, n.icon, n.is_read, n.read_at, n.created_at,
            n.emergency_id, e.code AS emergency_code
       FROM notifications n
       LEFT JOIN emergencies e ON e.id = n.emergency_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items, total: totalRow ? totalRow.total : 0 };
}

/** Contador para el badge de la campana. */
async function countUnread(userId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1 AND NOT is_read',
    [userId]
  );
  return row ? row.total : 0;
}

/**
 * Marca una notificacion como leida.
 * La condicion por user_id evita que alguien marque las de otro usuario.
 */
async function markAsRead(id, userId) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND NOT is_read`,
    [id, userId]
  );
  return result.rowCount > 0;
}

/** Marca toda la bandeja como leida. */
async function markAllAsRead(userId) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
      WHERE user_id = $1 AND NOT is_read`,
    [userId]
  );
  return result.rowCount;
}

module.exports = {
  create,
  createForMany,
  listForUser,
  countUnread,
  markAsRead,
  markAllAsRead,
};
