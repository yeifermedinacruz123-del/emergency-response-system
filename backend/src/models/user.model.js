/**
 * Acceso a datos de usuarios.
 *
 * Todas las consultas son parametrizadas ($1, $2, ...). El unico texto que se
 * concatena es el nombre de la columna de ordenamiento, y siempre despues de
 * validarlo contra una lista blanca (ver utils/pagination.js).
 *
 * Regla importante: `password_hash` NUNCA sale de este modulo salvo en
 * findByEmailWithPassword, que existe solo para el login.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');
const { getSorting } = require('../utils/pagination');

/** Columnas publicas de un usuario, con su rol resuelto. */
const PUBLIC_COLUMNS = `
  u.id, u.first_name, u.last_name,
  u.first_name || ' ' || u.last_name AS full_name,
  u.document_type, u.document_number, u.email, u.phone, u.address,
  u.is_active, u.last_login_at, u.created_at, u.updated_at,
  u.role_id, r.code AS role_code, r.name AS role_name
`;

/** Columnas por las que se puede ordenar el listado. */
const SORTABLE = {
  name: 'u.first_name',
  email: 'u.email',
  role: 'r.code',
  created: 'u.created_at',
  active: 'u.is_active',
};

/** Busca por id. Devuelve null si no existe. */
async function findById(id) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [id]
  );
}

/** Busca por correo, sin la contrasena. */
async function findByEmail(email) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );
}

/**
 * Busca por correo incluyendo el hash de la contrasena.
 * Solo lo usa el servicio de autenticacion.
 */
async function findByEmailWithPassword(email) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}, u.password_hash
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );
}

/** Devuelve el hash de la contrasena de un usuario (para verificar la actual). */
async function getPasswordHash(id) {
  const row = await queryOne('SELECT password_hash FROM users WHERE id = $1', [id]);
  return row ? row.password_hash : null;
}

/** true si el correo ya esta registrado (opcionalmente ignorando un id). */
async function emailExists(email, exceptId = null) {
  const row = await queryOne(
    `SELECT 1 FROM users
      WHERE LOWER(email) = LOWER($1) AND ($2::INT IS NULL OR id <> $2)`,
    [email, exceptId]
  );
  return row !== null;
}

/** true si el documento ya esta registrado (opcionalmente ignorando un id). */
async function documentExists(documentNumber, exceptId = null) {
  const row = await queryOne(
    `SELECT 1 FROM users
      WHERE document_number = $1 AND ($2::INT IS NULL OR id <> $2)`,
    [documentNumber, exceptId]
  );
  return row !== null;
}

/**
 * Listado con busqueda, filtros y paginacion.
 *
 * @param {object} filters { search, role, isActive }
 * @param {object} pagination { limit, offset }
 * @param {object} sortQuery req.query (para sort y order)
 * @returns {Promise<{items: Array, total: number}>}
 */
async function list(filters = {}, pagination = {}, sortQuery = {}) {
  const conditions = [];
  const params = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      u.first_name ILIKE $${params.length} OR
      u.last_name  ILIKE $${params.length} OR
      u.email      ILIKE $${params.length} OR
      u.document_number ILIKE $${params.length}
    )`);
  }

  if (filters.role) {
    params.push(filters.role);
    conditions.push(`r.code = $${params.length}`);
  }

  if (filters.isActive !== undefined && filters.isActive !== null) {
    params.push(filters.isActive);
    conditions.push(`u.is_active = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { clause } = getSorting(sortQuery, SORTABLE, 'created');

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ${where}`,
    params
  );

  const items = await queryAll(
    `SELECT ${PUBLIC_COLUMNS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ${where}
       ${clause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items, total: totalRow ? totalRow.total : 0 };
}

/**
 * Crea un usuario.
 * @param {object} data       Datos ya validados.
 * @param {object} [client]   Cliente de transaccion opcional.
 */
async function create(data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO users
       (role_id, first_name, last_name, document_type, document_number,
        email, phone, password_hash, address, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, TRUE))
     RETURNING id`,
    [
      data.role_id,
      data.first_name,
      data.last_name,
      data.document_type || 'CC',
      data.document_number,
      data.email,
      data.phone || null,
      data.password_hash,
      data.address || null,
      data.is_active,
    ]
  );

  return findById(result.rows[0].id);
}

/**
 * Actualiza los campos enviados. Los que no vengan se dejan como estan
 * (COALESCE con el valor actual), asi el mismo metodo sirve para el perfil
 * propio y para la edicion del administrador.
 */
async function update(id, data) {
  await query(
    `UPDATE users SET
       first_name      = COALESCE($2, first_name),
       last_name       = COALESCE($3, last_name),
       document_type   = COALESCE($4, document_type),
       document_number = COALESCE($5, document_number),
       email           = COALESCE($6, email),
       phone           = COALESCE($7, phone),
       address         = COALESCE($8, address),
       role_id         = COALESCE($9, role_id)
     WHERE id = $1`,
    [
      id,
      data.first_name ?? null,
      data.last_name ?? null,
      data.document_type ?? null,
      data.document_number ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.role_id ?? null,
    ]
  );

  return findById(id);
}

/** Activa o desactiva la cuenta. */
async function setActive(id, isActive) {
  await query('UPDATE users SET is_active = $2 WHERE id = $1', [id, isActive]);
  return findById(id);
}

/** Cambia el rol. */
async function setRole(id, roleId) {
  await query('UPDATE users SET role_id = $2 WHERE id = $1', [id, roleId]);
  return findById(id);
}

/** Guarda una contrasena ya hasheada. */
async function updatePassword(id, passwordHash) {
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

/** Marca la fecha del ultimo inicio de sesion. */
async function touchLastLogin(id) {
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
}

/**
 * Elimina un usuario.
 * Puede fallar con 23503 si tiene emergencias reportadas: la restriccion
 * ON DELETE RESTRICT protege el historial a proposito. En ese caso el
 * administrador debe desactivarlo en lugar de borrarlo.
 */
async function remove(id) {
  const result = await query('DELETE FROM users WHERE id = $1', [id]);
  return result.rowCount > 0;
}

/**
 * Ids de los usuarios activos que tienen alguno de los roles indicados.
 * Lo usa el servicio de notificaciones para avisar a todo el centro de control
 * de una sola vez.
 *
 * @param {string[]} roleCodes
 * @returns {Promise<number[]>}
 */
async function findIdsByRoles(roleCodes = []) {
  if (roleCodes.length === 0) return [];

  const rows = await queryAll(
    `SELECT u.id
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = ANY($1::VARCHAR[]) AND u.is_active`,
    [roleCodes]
  );

  return rows.map((row) => row.id);
}

/** Cuenta cuantos usuarios activos tienen un rol dado. */
async function countByRole(roleCode) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = $1 AND u.is_active`,
    [roleCode]
  );
  return row ? row.total : 0;
}

module.exports = {
  findById,
  findByEmail,
  findByEmailWithPassword,
  getPasswordHash,
  emailExists,
  documentExists,
  list,
  create,
  update,
  setActive,
  setRole,
  updatePassword,
  touchLastLogin,
  remove,
  findIdsByRoles,
  countByRole,
};
