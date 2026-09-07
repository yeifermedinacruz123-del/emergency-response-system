/**
 * Puntos geograficos de las emergencias.
 *
 * Se guardan en su propia tabla (y no como dos columnas dentro de
 * `emergencies`) porque una ubicacion tiene entidad propia: direccion,
 * referencia, zona y precision del GPS.
 */

'use strict';

const { query, queryOne } = require('../database');

/**
 * Crea una ubicacion.
 * Si no se indica zona, se asigna la mas cercana automaticamente para que las
 * estadisticas por zona funcionen aunque el ciudadano no elija ninguna.
 */
async function create(data, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query;

  const result = await run(
    `INSERT INTO locations
       (latitude, longitude, address, reference, zone_id, city, department, accuracy_m)
     VALUES ($1, $2, $3, $4, $5,
             COALESCE($6, 'Villavicencio'), COALESCE($7, 'Meta'), $8)
     RETURNING id`,
    [
      data.latitude,
      data.longitude,
      data.address || null,
      data.reference || null,
      data.zone_id || null,
      data.city || null,
      data.department || null,
      data.accuracy_m || null,
    ]
  );

  return result.rows[0];
}

/** Devuelve una ubicacion con el nombre de su zona. */
async function findById(id) {
  return queryOne(
    `SELECT l.*, z.name AS zone_name, z.code AS zone_code
       FROM locations l
       LEFT JOIN zones z ON z.id = l.zone_id
      WHERE l.id = $1`,
    [id]
  );
}

module.exports = { create, findById };
