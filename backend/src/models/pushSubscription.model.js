/**
 * Suscripciones a notificaciones push.
 *
 * Cada navegador donde el usuario acepta las notificaciones crea una
 * suscripcion propia. Un mismo usuario puede tener varias (telefono, tablet,
 * portatil), asi que la clave unica es el endpoint, no el usuario.
 */

'use strict';

const { query, queryAll } = require('../database');

/**
 * Guarda una suscripcion.
 *
 * Si el endpoint ya existe se actualiza en lugar de fallar: el navegador puede
 * devolver la misma suscripcion tras reinstalar la aplicacion, y en ese caso
 * lo correcto es reasignarla al usuario actual, no crear un duplicado.
 */
async function save({ userId, endpoint, p256dh, auth, userAgent }) {
  const result = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id       = EXCLUDED.user_id,
       p256dh        = EXCLUDED.p256dh,
       auth          = EXCLUDED.auth,
       user_agent    = EXCLUDED.user_agent,
       failure_count = 0
     RETURNING id, user_id, created_at`,
    [userId, endpoint, p256dh, auth, userAgent || null]
  );

  return result.rows[0];
}

/** Suscripciones activas de un usuario. */
async function findByUser(userId) {
  return queryAll(
    `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  );
}

/** Suscripciones de varios usuarios de una vez (avisos al centro de control). */
async function findByUsers(userIds = []) {
  if (userIds.length === 0) return [];

  return queryAll(
    `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = ANY($1::INT[])`,
    [userIds]
  );
}

/** Elimina una suscripcion por su endpoint. */
async function removeByEndpoint(endpoint) {
  const result = await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  return result.rowCount > 0;
}

/** Elimina una suscripcion por id. */
async function removeById(id) {
  const result = await query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
  return result.rowCount > 0;
}

/** Marca un envio correcto. */
async function markUsed(id) {
  await query(
    'UPDATE push_subscriptions SET last_used_at = NOW(), failure_count = 0 WHERE id = $1',
    [id]
  );
}

/**
 * Anota un fallo de envio.
 * A las 5 fallos seguidos la suscripcion se borra: el navegador ya no existe
 * o el usuario desinstalo la aplicacion, y seguir intentandolo solo gasta
 * tiempo en cada notificacion.
 */
async function markFailure(id) {
  const result = await query(
    `UPDATE push_subscriptions
        SET failure_count = failure_count + 1
      WHERE id = $1
      RETURNING failure_count`,
    [id]
  );

  const failures = result.rows[0] ? result.rows[0].failure_count : 0;
  if (failures >= 5) await removeById(id);

  return failures;
}

/** Cuantas suscripciones hay registradas. */
async function count() {
  const result = await query('SELECT COUNT(*) AS total FROM push_subscriptions');
  return result.rows[0].total;
}

module.exports = {
  save,
  findByUser,
  findByUsers,
  removeByEndpoint,
  removeById,
  markUsed,
  markFailure,
  count,
};
