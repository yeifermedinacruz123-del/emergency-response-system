/**
 * Fotografias adjuntas a una emergencia.
 *
 * La tabla guarda la RUTA PUBLICA, no el archivo. Hoy esa ruta apunta a
 * /uploads (disco local); el dia que se use S3 o Cloudinary bastara con guardar
 * la URL externa: el resto del sistema no cambia.
 */

'use strict';

const { query, queryAll, queryOne } = require('../database');

/**
 * Inserta varias fotografias de una vez.
 * @param {number} emergencyId
 * @param {Array<object>} photos Registros creados por upload.middleware
 * @param {import('pg').PoolClient} [client]
 */
async function createMany(emergencyId, photos = [], client = null) {
  if (photos.length === 0) return [];

  const run = client ? (text, params) => client.query(text, params) : query;

  // Se arma un INSERT con varias tuplas: ($1,$2,...), ($8,$9,...), ...
  const values = [];
  const params = [];

  photos.forEach((photo) => {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
    );
    params.push(
      emergencyId,
      photo.uploaded_by || null,
      photo.file_name,
      photo.file_path,
      photo.mime_type || null,
      photo.size_bytes || null,
      // Buffer -> BYTEA. Null cuando el archivo quedo en disco (STORAGE_PROVIDER=local).
      photo.content || null
    );
  });

  const result = await run(
    `INSERT INTO photos (emergency_id, uploaded_by, file_name, file_path, mime_type, size_bytes, content)
     VALUES ${values.join(', ')}
     RETURNING id, file_path`,
    params
  );

  return result.rows;
}

/** Fotografias de una emergencia, de la mas antigua a la mas reciente. */
async function findByEmergency(emergencyId) {
  return queryAll(
    `SELECT p.id, p.file_name, p.file_path, p.mime_type, p.size_bytes, p.created_at,
            p.uploaded_by, u.first_name || ' ' || u.last_name AS uploaded_by_name
       FROM photos p
       LEFT JOIN users u ON u.id = p.uploaded_by
      WHERE p.emergency_id = $1
      ORDER BY p.created_at`,
    [emergencyId]
  );
}

/**
 * Cuantas fotografias tiene ya una emergencia (para respetar el maximo).
 * La nota de voz vive en la misma tabla, pero no cuenta como fotografia.
 */
async function countByEmergency(emergencyId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM photos
      WHERE emergency_id = $1 AND (mime_type IS NULL OR mime_type LIKE 'image/%')`,
    [emergencyId]
  );
  return row ? row.total : 0;
}

/**
 * Un archivo para servirlo por /uploads, con su contenido si esta en la base.
 * Es la unica consulta que lee la columna content: los listados no la tocan
 * para no arrastrar megabytes en cada detalle de emergencia.
 */
async function findFile(fileName) {
  return queryOne(
    `SELECT p.id, p.file_name, p.mime_type, p.size_bytes, p.content
       FROM photos p
       JOIN emergencies e ON e.id = p.emergency_id
      WHERE p.file_name = $1 AND NOT e.is_deleted`,
    [fileName]
  );
}

module.exports = { createMany, findByEmergency, countByEmergency, findFile };
