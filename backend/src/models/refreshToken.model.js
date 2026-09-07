/**
 * Tokens de refresco activos.
 *
 * Se guarda el HASH del token, nunca el token en claro. El objetivo de la tabla
 * es poder REVOCAR sesiones: cerrar sesion, expulsar a un usuario desactivado o
 * invalidar todo tras un cambio de contrasena.
 */

'use strict';

const { query, queryOne } = require('../database');

/** Registra un token de refresco recien emitido. */
async function create({ userId, tokenHash, expiresAt, userAgent, ipAddress }) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, tokenHash, expiresAt, userAgent || null, ipAddress || null]
  );
  return result.rows[0];
}

/**
 * Busca un token vigente: que exista, no este revocado y no haya expirado.
 * Devuelve null si cualquiera de las tres condiciones falla.
 */
async function findValid(tokenHash) {
  return queryOne(
    `SELECT id, user_id, expires_at
       FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()`,
    [tokenHash]
  );
}

/** Revoca un token concreto (cerrar sesion en este dispositivo). */
async function revoke(tokenHash) {
  const result = await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return result.rowCount > 0;
}

/** Revoca todas las sesiones de un usuario (cambio de contrasena, bloqueo). */
async function revokeAllForUser(userId) {
  const result = await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return result.rowCount;
}

/**
 * Borra los tokens ya expirados o revocados hace mas de 30 dias.
 * Mantiene la tabla pequeña; se puede llamar desde una tarea programada.
 */
async function purgeExpired() {
  const result = await query(
    `DELETE FROM refresh_tokens
      WHERE expires_at < NOW()
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`
  );
  return result.rowCount;
}

module.exports = { create, findValid, revoke, revokeAllForUser, purgeExpired };
