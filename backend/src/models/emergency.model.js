/**
 * Acceso a datos de emergencias.
 *
 * Las lecturas usan la vista `v_emergencies_full`, que ya resuelve los JOIN con
 * tipo, estado, prioridad, ubicacion, zona y ciudadano. Asi el SQL de este
 * modulo se concentra en filtrar y ordenar, no en repetir seis JOIN.
 */

'use strict';

const { query, queryOne, queryAll } = require('../database');
const { getSorting } = require('../utils/pagination');

/** Columnas por las que se puede ordenar el listado. */
const SORTABLE = {
  reported: 'e.reported_at',
  priority: 'e.priority_level',
  status: 'e.status_id',
  type: 'e.type_name',
  code: 'e.code',
};

/**
 * Traduce los filtros de la query a condiciones SQL parametrizadas.
 * Se usa tanto para el listado como para el conteo, para que ambos vean
 * exactamente el mismo conjunto de filas.
 *
 * @returns {{where: string, params: Array}}
 */
function buildFilters(filters = {}) {
  // Las emergencias con baja logica no aparecen en ningun listado.
  const conditions = ['NOT e.is_deleted'];
  const params = [];

  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  if (filters.status) add('e.status_code = ?', filters.status);
  if (filters.type) add('e.type_code = ?', filters.type);
  if (filters.priority) add('e.priority_code = ?', filters.priority);
  if (filters.zoneId) add('e.zone_id = ?', filters.zoneId);
  if (filters.userId) add('e.reporter_id = ?', filters.userId);
  if (filters.from) add('e.reported_at >= ?', filters.from);
  if (filters.to) add('e.reported_at <= ?', filters.to);

  if (filters.sos === true) conditions.push('e.is_sos');
  if (filters.sos === false) conditions.push('NOT e.is_sos');

  if (filters.activeOnly) conditions.push("e.status_code IN ('PENDIENTE','EN_PROCESO')");

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      e.title   ILIKE $${params.length} OR
      e.code    ILIKE $${params.length} OR
      e.address ILIKE $${params.length} OR
      e.reporter_name ILIKE $${params.length}
    )`);
  }

  /*
   * Filtro por personal asignado: se resuelve con EXISTS en vez de un JOIN
   * para que una emergencia con varias unidades no se duplique en el listado.
   */
  if (filters.responderId) {
    params.push(filters.responderId);
    conditions.push(`EXISTS (
      SELECT 1 FROM assignments a
       WHERE a.emergency_id = e.id
         AND a.responder_id = $${params.length}
         AND a.status <> 'CANCELADO'
    )`);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

/** Detalle de una emergencia. Devuelve null si no existe o esta eliminada. */
async function findById(id) {
  return queryOne(
    `SELECT * FROM v_emergencies_full e WHERE e.id = $1 AND NOT e.is_deleted`,
    [id]
  );
}

/** Igual que findById pero incluye las eliminadas (para el administrador). */
async function findByIdIncludingDeleted(id) {
  return queryOne('SELECT * FROM v_emergencies_full e WHERE e.id = $1', [id]);
}

/**
 * Listado paginado con filtros.
 * @returns {Promise<{items: Array, total: number}>}
 */
async function list(filters = {}, pagination = {}, sortQuery = {}) {
  const { where, params } = buildFilters(filters);
  const { clause } = getSorting(sortQuery, SORTABLE, 'reported');

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM v_emergencies_full e ${where}`,
    params
  );

  const items = await queryAll(
    `SELECT * FROM v_emergencies_full e
      ${where}
      ${clause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pagination.limit, pagination.offset]
  );

  return { items, total: totalRow ? totalRow.total : 0 };
}

/**
 * Puntos para el mapa: solo lo que necesita un marcador.
 * Se devuelve una lista ligera porque el mapa puede pintar cientos de puntos.
 */
async function listForMap(filters = {}) {
  const { where, params } = buildFilters(filters);

  return queryAll(
    `SELECT id, code, title, latitude, longitude, is_sos, reported_at,
            type_code, type_name, type_icon, type_color,
            status_code, status_name, status_color,
            priority_code, priority_name, priority_color, priority_level,
            address, zone_name, assignment_count
       FROM v_emergencies_full e
       ${where}
       ORDER BY e.is_sos DESC, e.priority_level DESC, e.reported_at DESC
       LIMIT 500`,
    params
  );
}

/**
 * Inserta una emergencia.
 * El codigo (ERS-2026-000042) lo genera el trigger trg_emergencies_code.
 *
 * @param {object} data
 * @param {import('pg').PoolClient} [client] Cliente de transaccion.
 */
async function create(data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO emergencies
       (user_id, type_id, status_id, priority_id, location_id,
        title, description, is_sos, reported_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, FALSE), COALESCE($9, NOW()))
     RETURNING id, code`,
    [
      data.user_id,
      data.type_id,
      data.status_id,
      data.priority_id,
      data.location_id,
      data.title,
      data.description || null,
      data.is_sos,
      data.reported_at || null,
    ]
  );

  return result.rows[0];
}

/** Actualiza titulo y descripcion. Solo cambia lo que llega. */
async function update(id, data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  await run(
    `UPDATE emergencies SET
       title       = COALESCE($2, title),
       description = COALESCE($3, description)
     WHERE id = $1`,
    [id, data.title ?? null, data.description ?? null]
  );
}

/**
 * Cambia el estado y actualiza la marca de tiempo que corresponde.
 * Las marcas (in_progress_at, resolved_at, closed_at) se escriben aqui y no en
 * el servicio para que estado y fecha nunca queden desincronizados.
 */
async function updateStatus(id, statusCode, statusId, extra = {}, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  await run(
    `UPDATE emergencies SET
       status_id      = $2,
       in_progress_at = CASE WHEN $3 = 'EN_PROCESO' AND in_progress_at IS NULL
                             THEN NOW() ELSE in_progress_at END,
       resolved_at    = CASE WHEN $3 = 'RESUELTO'  THEN NOW() ELSE resolved_at END,
       closed_at      = CASE WHEN $3 IN ('RESUELTO','CANCELADO')
                             THEN NOW() ELSE closed_at END,
       resolution_notes = COALESCE($4, resolution_notes),
       cancel_reason    = COALESCE($5, cancel_reason)
     WHERE id = $1`,
    [id, statusId, statusCode, extra.resolutionNotes ?? null, extra.cancelReason ?? null]
  );
}

/** Cambia la prioridad. */
async function updatePriority(id, priorityId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run('UPDATE emergencies SET priority_id = $2 WHERE id = $1', [id, priorityId]);
}

/** Marca la primera asignacion de personal (solo la primera vez). */
async function markAssigned(id, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run(
    'UPDATE emergencies SET assigned_at = COALESCE(assigned_at, NOW()) WHERE id = $1',
    [id]
  );
}

/** Cambia la ubicacion asociada. */
async function updateLocation(id, locationId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  await run('UPDATE emergencies SET location_id = $2 WHERE id = $1', [id, locationId]);
}

/**
 * Baja logica. No se borra la fila para no perder el historial ni romper las
 * estadisticas: solo deja de aparecer en los listados.
 */
async function softDelete(id) {
  const result = await query(
    'UPDATE emergencies SET is_deleted = TRUE WHERE id = $1 AND NOT is_deleted',
    [id]
  );
  return result.rowCount > 0;
}

module.exports = {
  findById,
  findByIdIncludingDeleted,
  list,
  listForMap,
  create,
  update,
  updateStatus,
  updatePriority,
  markAssigned,
  updateLocation,
  softDelete,
};
