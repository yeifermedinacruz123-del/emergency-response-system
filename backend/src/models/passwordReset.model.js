/**
 * Tokens de un solo uso para "olvide mi contrasena".
 *
 * Igual que refresh_tokens, se guarda el HASH del token, nunca el valor en
 * claro: el correo lleva el token real, la base solo necesita poder
 * reconocerlo despues.
 */

'use strict';

const { query, queryOne } = require('../database');

/** Crea un token de recuperacion para un usuario. */
async function create({ userId, tokenHash, expiresAt }) {
  const result = await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

/** Busca un token vigente: que exista, no se haya usado y no haya expirado. */
async function findValid(tokenHash) {
  return queryOne(
    `SELECT id, user_id, expires_at
       FROM password_resets
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()`,
    [tokenHash]
  );
}

/** Marca el token como usado, para que no sirva una segunda vez. */
async function markUsed(id) {
  await query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [id]);
}

/**
 * Invalida cualquier token anterior sin usar del mismo usuario.
 * Pedir varios enlaces seguidos no debe dejar varios validos a la vez.
 */
async function invalidateAllForUser(userId) {
  await query(
    `UPDATE password_resets
        SET used_at = NOW()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

module.exports = { create, findValid, markUsed, invalidateAllForUser };
