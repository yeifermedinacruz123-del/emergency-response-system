/**
 * Acceso a los catalogos: roles, tipos, estados, prioridades y zonas.
 *
 * Son tablas pequeñas y casi inmutables, asi que se cachean en memoria durante
 * unos minutos. Con esto el frontend puede pedir los catalogos en cada pantalla
 * sin golpear la base de datos, y las traducciones codigo -> id que hacen los
 * servicios (por ejemplo "PENDIENTE" -> 1) son inmediatas.
 */

'use strict';

const { queryAll, queryOne } = require('../database');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/** Devuelve del cache o ejecuta la consulta y la guarda. */
async function cached(key, loader) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.storedAt < CACHE_TTL_MS) return entry.value;

  const value = await loader();
  cache.set(key, { value, storedAt: Date.now() });
  return value;
}

/** Vacia el cache. Se llama cuando se modifica un catalogo. */
function clearCache() {
  cache.clear();
}

const getRoles = () =>
  cached('roles', () => queryAll('SELECT id, code, name, description FROM roles ORDER BY id'));

const getTypes = () =>
  cached('types', () =>
    queryAll(
      `SELECT id, code, name, description, icon, color
         FROM emergency_types
        WHERE is_active
        ORDER BY id`
    )
  );

const getStatuses = () =>
  cached('statuses', () =>
    queryAll(
      `SELECT id, code, name, description, color, is_final
         FROM emergency_status
        ORDER BY sort_order`
    )
  );

const getPriorities = () =>
  cached('priorities', () =>
    queryAll(
      `SELECT id, code, name, color, level, target_minutes
         FROM priorities
        ORDER BY level`
    )
  );

const getZones = () =>
  cached('zones', () =>
    queryAll(
      `SELECT id, code, name, city, department, latitude, longitude
         FROM zones
        WHERE is_active
        ORDER BY name`
    )
  );

/** Todos los catalogos en una sola respuesta, para cargar la interfaz. */
async function getAll() {
  const [roles, types, statuses, priorities, zones] = await Promise.all([
    getRoles(),
    getTypes(),
    getStatuses(),
    getPriorities(),
    getZones(),
  ]);
  return { roles, types, statuses, priorities, zones };
}

/* -------------------------------------------------------------------------
 *  Traducciones codigo -> registro. Devuelven null si el codigo no existe,
 *  para que el servicio pueda responder un 422 claro.
 * ---------------------------------------------------------------------- */

async function findRoleByCode(code) {
  const roles = await getRoles();
  return roles.find((role) => role.code === code) || null;
}

async function findTypeByCode(code) {
  const types = await getTypes();
  return types.find((type) => type.code === code) || null;
}

async function findStatusByCode(code) {
  const statuses = await getStatuses();
  return statuses.find((status) => status.code === code) || null;
}

async function findPriorityByCode(code) {
  const priorities = await getPriorities();
  return priorities.find((priority) => priority.code === code) || null;
}

async function findZoneById(id) {
  const zones = await getZones();
  return zones.find((zone) => zone.id === Number(id)) || null;
}

/**
 * Zona mas cercana a un punto, para clasificar automaticamente una emergencia.
 * Usa distancia euclidiana sobre las coordenadas: a escala de una ciudad es
 * suficiente y evita depender de PostGIS.
 */
async function findNearestZone(latitude, longitude) {
  return queryOne(
    `SELECT id, code, name
       FROM zones
      WHERE is_active AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY POWER(latitude - $1, 2) + POWER(longitude - $2, 2)
      LIMIT 1`,
    [latitude, longitude]
  );
}

module.exports = {
  getRoles,
  getTypes,
  getStatuses,
  getPriorities,
  getZones,
  getAll,
  findRoleByCode,
  findTypeByCode,
  findStatusByCode,
  findPriorityByCode,
  findZoneById,
  findNearestZone,
  clearCache,
};
