/**
 * Personal de emergencia (unidades operativas).
 *
 * Las lecturas usan la vista `v_responders_full`, que ya trae los datos del
 * usuario asociado y cuantas asignaciones activas tiene la unidad.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');
const { getSorting } = require('../utils/pagination');

const SORTABLE = {
  unit: 'r.unit_code',
  name: 'r.full_name',
  type: 'r.responder_type',
  status: 'r.status',
  created: 'r.created_at',
};

/** Ficha de una unidad. */
async function findById(id) {
  return queryOne('SELECT * FROM v_responders_full r WHERE r.id = $1', [id]);
}

/** Ficha de la unidad que corresponde a un usuario (para el rol PERSONAL). */
async function findByUserId(userId) {
  return queryOne('SELECT * FROM v_responders_full r WHERE r.user_id = $1', [userId]);
}

/** Listado con filtros por tipo y estado. */
async function list(filters = {}, pagination = {}, sortQuery = {}) {
  const conditions = [];
  const params = [];

  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  if (filters.type) add('r.responder_type = ?', filters.type);
  if (filters.status) add('r.status = ?', filters.status);
  if (filters.isActive !== undefined && filters.isActive !== null) {
    add('r.is_active = ?', filters.isActive);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      r.full_name ILIKE $${params.length} OR
      r.unit_code ILIKE $${params.length} OR
      r.unit_name ILIKE $${params.length} OR
      r.institution ILIKE $${params.length}
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { clause } = getSorting(sortQuery, SORTABLE, 'unit', 'ASC');

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM v_responders_full r ${where}`,
    params
  );

  const items = await queryAll(
    `SELECT * FROM v_responders_full r
      ${where}
      ${clause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items, total: totalRow ? totalRow.total : 0 };
}

/**
 * Unidades disponibles, opcionalmente ordenadas por cercania a un punto.
 *
 * La distancia se calcula con la formula del haversine directamente en SQL.
 * Es exacta para el radio de una ciudad y evita instalar PostGIS, que seria
 * una dependencia grande para una sola consulta.
 */
async function findAvailable({ type, latitude, longitude, limit = 20 }) {
  const params = [];
  const conditions = ["r.status = 'DISPONIBLE'", 'r.is_active', 'r.user_is_active'];

  if (type) {
    params.push(type);
    conditions.push(`r.responder_type = $${params.length}`);
  }

  // Sin coordenadas se ordena por codigo de unidad; con ellas, por distancia.
  let distanceSelect = 'NULL::NUMERIC AS distance_km';
  let orderBy = 'ORDER BY r.unit_code';

  if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
    params.push(latitude, longitude);
    const latParam = `$${params.length - 1}`;
    const lngParam = `$${params.length}`;

    distanceSelect = `
      CASE WHEN r.current_latitude IS NULL OR r.current_longitude IS NULL THEN NULL
      ELSE 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(r.current_latitude - ${latParam}) / 2), 2) +
        COS(RADIANS(${latParam})) * COS(RADIANS(r.current_latitude)) *
        POWER(SIN(RADIANS(r.current_longitude - ${lngParam}) / 2), 2)
      )) END AS distance_km`;

    orderBy = 'ORDER BY distance_km ASC NULLS LAST, r.unit_code';
  }

  params.push(limit);

  return queryAll(
    `SELECT r.*, ${distanceSelect}
       FROM v_responders_full r
      WHERE ${conditions.join(' AND ')}
      ${orderBy}
      LIMIT $${params.length}`,
    params
  );
}

/** true si el codigo de unidad ya existe. */
async function unitCodeExists(unitCode, exceptId = null) {
  const row = await queryOne(
    `SELECT 1 FROM responders
      WHERE unit_code = $1 AND ($2::INT IS NULL OR id <> $2)`,
    [unitCode, exceptId]
  );
  return row !== null;
}

/** true si el usuario ya tiene ficha de personal. */
async function userHasProfile(userId, exceptId = null) {
  const row = await queryOne(
    `SELECT 1 FROM responders
      WHERE user_id = $1 AND ($2::INT IS NULL OR id <> $2)`,
    [userId, exceptId]
  );
  return row !== null;
}

/** Crea la ficha de personal. */
async function create(data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO responders
       (user_id, responder_type, unit_code, unit_name, institution, status)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'DISPONIBLE'))
     RETURNING id`,
    [
      data.user_id,
      data.responder_type,
      data.unit_code,
      data.unit_name || null,
      data.institution || null,
      data.status || null,
    ]
  );

  return findById(result.rows[0].id);
}

/** Actualiza la ficha. Solo cambia lo que llega. */
async function update(id, data) {
  await query(
    `UPDATE responders SET
       responder_type = COALESCE($2, responder_type),
       unit_code      = COALESCE($3, unit_code),
       unit_name      = COALESCE($4, unit_name),
       institution    = COALESCE($5, institution),
       status         = COALESCE($6, status),
       is_active      = COALESCE($7, is_active)
     WHERE id = $1`,
    [
      id,
      data.responder_type ?? null,
      data.unit_code ?? null,
      data.unit_name ?? null,
      data.institution ?? null,
      data.status ?? null,
      data.is_active ?? null,
    ]
  );

  return findById(id);
}

/** Cambia la disponibilidad. */
async function updateStatus(id, status, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run('UPDATE responders SET status = $2 WHERE id = $1', [id, status]);
}

/** Marca como OCUPADO solo si estaba DISPONIBLE (no pisa FUERA_DE_SERVICIO). */
async function markBusy(id, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run(
    `UPDATE responders SET status = 'OCUPADO'
      WHERE id = $1 AND status = 'DISPONIBLE'`,
    [id]
  );
}

/** Libera una unidad que estaba OCUPADA. */
async function markAvailable(id, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run(
    `UPDATE responders SET status = 'DISPONIBLE'
      WHERE id = $1 AND status = 'OCUPADO'`,
    [id]
  );
}

/** Guarda la posicion GPS reportada por la unidad. */
async function updateLocation(id, latitude, longitude) {
  await query(
    `UPDATE responders SET
       current_latitude = $2, current_longitude = $3, location_updated_at = NOW()
     WHERE id = $1`,
    [id, latitude, longitude]
  );
  return findById(id);
}

/** Posiciones actuales para pintar las unidades en el mapa. */
async function listForMap() {
  return queryAll(
    `SELECT id, user_id, full_name, unit_code, unit_name, responder_type,
            institution, status, current_latitude, current_longitude,
            location_updated_at, active_assignments
       FROM v_responders_full
      WHERE is_active
        AND current_latitude IS NOT NULL
        AND current_longitude IS NOT NULL
      ORDER BY unit_code`
  );
}

module.exports = {
  findById,
  findByUserId,
  list,
  findAvailable,
  unitCodeExists,
  userHasProfile,
  create,
  update,
  updateStatus,
  markBusy,
  markAvailable,
  updateLocation,
  listForMap,
};
