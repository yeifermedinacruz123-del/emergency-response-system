/**
 * Asignaciones: que unidad atiende que emergencia.
 *
 * Es la tabla intermedia de la relacion N:M entre `emergencies` y `responders`,
 * con sus propias marcas de tiempo (asignado, en camino, en sitio, completado).
 */

'use strict';

const { query, queryAll, queryOne } = require('../database');

/** Datos de la asignacion junto con los de la unidad y su responsable. */
const COLUMNS = `
  a.id, a.emergency_id, a.responder_id, a.assigned_by, a.status,
  a.assigned_at, a.accepted_at, a.en_route_at, a.on_site_at, a.completed_at,
  a.notes, a.created_at, a.updated_at,
  r.unit_code, r.unit_name, r.responder_type, r.institution,
  r.current_latitude, r.current_longitude, r.status AS responder_status,
  u.id AS responder_user_id,
  u.first_name || ' ' || u.last_name AS responder_name,
  u.phone AS responder_phone
`;

/** Asignaciones de una emergencia (incluidas las canceladas, para el historial). */
async function findByEmergency(emergencyId) {
  return queryAll(
    `SELECT ${COLUMNS}
       FROM assignments a
       JOIN responders r ON r.id = a.responder_id
       JOIN users u      ON u.id = r.user_id
      WHERE a.emergency_id = $1
      ORDER BY a.assigned_at`,
    [emergencyId]
  );
}

/** Una asignacion concreta. */
async function findById(id) {
  return queryOne(
    `SELECT ${COLUMNS}
       FROM assignments a
       JOIN responders r ON r.id = a.responder_id
       JOIN users u      ON u.id = r.user_id
      WHERE a.id = $1`,
    [id]
  );
}

/** Asignacion activa de una unidad en una emergencia, si existe. */
async function findActive(emergencyId, responderId) {
  return queryOne(
    `SELECT id, status FROM assignments
      WHERE emergency_id = $1 AND responder_id = $2 AND status <> 'CANCELADO'`,
    [emergencyId, responderId]
  );
}

/**
 * Cualquier asignacion de esa unidad en esa emergencia, incluidas las
 * canceladas. Sirve para decidir entre crear una nueva o reactivar la anterior,
 * ya que UNIQUE (emergency_id, responder_id) impide tener dos.
 */
async function findAny(emergencyId, responderId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  const result = await run(
    'SELECT id, status FROM assignments WHERE emergency_id = $1 AND responder_id = $2',
    [emergencyId, responderId]
  );
  return result.rows[0] || null;
}

/** Crea la asignacion. */
async function create({ emergencyId, responderId, assignedBy, notes }, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO assignments (emergency_id, responder_id, assigned_by, status, notes)
     VALUES ($1, $2, $3, 'ASIGNADO', $4)
     RETURNING id`,
    [emergencyId, responderId, assignedBy ?? null, notes || null]
  );

  return result.rows[0];
}

/**
 * Reactiva una asignacion que estaba cancelada.
 * Evita chocar con la restriccion UNIQUE (emergency_id, responder_id) cuando se
 * vuelve a asignar la misma unidad al mismo incidente.
 */
async function reactivate(id, assignedBy, notes, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  await run(
    `UPDATE assignments SET
       status       = 'ASIGNADO',
       assigned_by  = $2,
       assigned_at  = NOW(),
       accepted_at  = NULL,
       en_route_at  = NULL,
       on_site_at   = NULL,
       completed_at = NULL,
       notes        = COALESCE($3, notes)
     WHERE id = $1`,
    [id, assignedBy ?? null, notes || null]
  );
}

/**
 * Cambia el estado de la asignacion y sella la marca de tiempo que toca.
 * Igual que en las emergencias, estado y fecha se escriben juntos.
 */
async function updateStatus(id, status, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  await run(
    `UPDATE assignments SET
       status       = $2,
       accepted_at  = CASE WHEN $2 = 'EN_CAMINO'  AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
       en_route_at  = CASE WHEN $2 = 'EN_CAMINO'  THEN NOW() ELSE en_route_at END,
       on_site_at   = CASE WHEN $2 = 'EN_SITIO'   THEN NOW() ELSE on_site_at END,
       completed_at = CASE WHEN $2 = 'COMPLETADO' THEN NOW() ELSE completed_at END
     WHERE id = $1`,
    [id, status]
  );
}

/** Cancela una asignacion (retirar personal de una emergencia). */
async function cancel(id, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  const result = await run(
    `UPDATE assignments SET status = 'CANCELADO' WHERE id = $1 AND status <> 'CANCELADO'`,
    [id]
  );
  return result.rowCount > 0;
}

/** Cierra todas las asignaciones activas de una emergencia que se resuelve. */
async function completeAllForEmergency(emergencyId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  const result = await run(
    `UPDATE assignments
        SET status = 'COMPLETADO', completed_at = NOW()
      WHERE emergency_id = $1 AND status IN ('ASIGNADO','EN_CAMINO','EN_SITIO')
      RETURNING responder_id`,
    [emergencyId]
  );
  return result.rows.map((row) => row.responder_id);
}

/** true si la unidad tiene alguna asignacion sin cerrar. */
async function hasActiveWork(responderId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;
  const result = await run(
    `SELECT 1 FROM assignments
      WHERE responder_id = $1 AND status IN ('ASIGNADO','EN_CAMINO','EN_SITIO')
      LIMIT 1`,
    [responderId]
  );
  return result.rows.length > 0;
}

module.exports = {
  findByEmergency,
  findById,
  findActive,
  findAny,
  create,
  reactivate,
  updateStatus,
  cancel,
  completeAllForEmergency,
  hasActiveWork,
};
