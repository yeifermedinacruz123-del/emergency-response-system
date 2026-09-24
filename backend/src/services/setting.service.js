/**
 * Configuracion del sistema que el administrador cambia desde el panel.
 *
 * Antes la tabla system_settings solo se mostraba y se editaba: ninguna parte
 * del sistema la leia, asi que cambiar "Maximo de fotografias" o "Prioridad
 * del SOS" no tenia ningun efecto. Ahora cada opcion se aplica:
 *
 *   map.center.lat / .lng / map.zoom  centro del mapa (panel y PWA)
 *   app.city                          ciudad que muestra el mapa
 *   sos.auto_priority                 prioridad con la que entra un SOS
 *   emergency.max_photos              fotos por emergencia (tope: el .env)
 *   notifications.push_enabled        interruptor del envio push
 *
 * Los valores se guardan en memoria unos segundos para no consultar la tabla
 * en cada peticion; al guardar desde el panel la cache se vacia al instante.
 */

'use strict';

const settingModel = require('../models/setting.model');
const { config } = require('../config/env');
const { PRIORITIES } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const CACHE_MS = 30 * 1000;

let cache = null;
let cachedAt = 0;

/** Todas las opciones como { clave: valor }, con cache corta. */
async function getAll() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;

  try {
    cache = await settingModel.getAsObject();
    cachedAt = Date.now();
  } catch (error) {
    // Sin base de datos se trabaja con los valores del .env: la
    // configuracion es un ajuste, no algo que deba tumbar una peticion.
    logger.warn(`No se pudo leer la configuracion del sistema: ${error.message}`);
    return cache || {};
  }

  return cache;
}

/** Vacia la cache: la siguiente lectura va a la base. */
function invalidate() {
  cache = null;
}

/** Un valor concreto, o el de respaldo si no existe o no es valido. */
async function get(key, fallback) {
  const all = await getAll();
  const value = all[key];
  return value === undefined || value === null || Number.isNaN(value) ? fallback : value;
}

/* ------------------------------------------------------------ lecturas */

async function getMapSettings() {
  const [lat, lng, zoom, city] = await Promise.all([
    get('map.center.lat', config.geo.lat),
    get('map.center.lng', config.geo.lng),
    get('map.zoom', config.geo.zoom),
    get('app.city', config.geo.city),
  ]);
  return { center: { lat, lng }, zoom, city };
}

async function getSosPriority() {
  const value = await get('sos.auto_priority', PRIORITIES.CRITICA);
  return Object.values(PRIORITIES).includes(value) ? value : PRIORITIES.CRITICA;
}

/** Fotos por emergencia: lo que diga el panel, sin pasar el tope del .env. */
async function getMaxPhotos() {
  const hardLimit = config.storage.maxFilesPerEmergency;
  const value = Number.parseInt(await get('emergency.max_photos', hardLimit), 10);
  if (Number.isNaN(value) || value < 1) return hardLimit;
  return Math.min(value, hardLimit);
}

async function isPushEnabled() {
  return (await get('notifications.push_enabled', true)) !== false;
}

/* ---------------------------------------------------------- validacion */

/** Reglas por clave. Devuelven el mensaje de error, o null si es valido. */
const RULES = {
  'map.center.lat': (v) => (Number.isFinite(v) && v >= -90 && v <= 90 ? null : 'Debe estar entre -90 y 90'),
  'map.center.lng': (v) => (Number.isFinite(v) && v >= -180 && v <= 180 ? null : 'Debe estar entre -180 y 180'),
  'map.zoom': (v) => (Number.isInteger(v) && v >= 3 && v <= 18 ? null : 'Debe ser un entero entre 3 y 18'),
  'emergency.max_photos': (v) => (Number.isInteger(v) && v >= 1 && v <= config.storage.maxFilesPerEmergency
    ? null
    : `Debe ser un entero entre 1 y ${config.storage.maxFilesPerEmergency}`),
  'sos.auto_priority': (v) => (Object.values(PRIORITIES).includes(v)
    ? null
    : `Debe ser una de: ${Object.values(PRIORITIES).join(', ')}`),
  'app.name': (v) => (typeof v === 'string' && v.trim().length >= 2 && v.length <= 80 ? null : 'Entre 2 y 80 caracteres'),
  'app.city': (v) => (typeof v === 'string' && v.trim().length >= 2 && v.length <= 80 ? null : 'Entre 2 y 80 caracteres'),
};

/** Convierte lo recibido al tipo declarado de la opcion. */
function coerce(value, dataType) {
  if (dataType === 'number') return typeof value === 'number' ? value : Number(String(value).trim());
  if (dataType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') return value === 'true';
    return undefined;
  }
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Valida y guarda los cambios. Rechaza el lote entero si algun valor no es
 * valido: guardar la mitad dejaria la configuracion en un estado a medias.
 *
 * @returns {Promise<string[]>} Claves actualizadas.
 */
async function update(changes, userId) {
  const current = await settingModel.getAll();
  const byKey = new Map(current.map((setting) => [setting.key, setting]));

  const errors = [];
  const clean = {};

  Object.entries(changes).forEach(([key, raw]) => {
    const setting = byKey.get(key);
    if (!setting) return; // claves desconocidas: se ignoran (catalogo cerrado)

    const value = coerce(raw, setting.dataType);
    if (value === undefined || (setting.dataType === 'number' && !Number.isFinite(value))) {
      errors.push({ field: key, message: `Debe ser de tipo ${setting.dataType}` });
      return;
    }

    const problem = RULES[key] ? RULES[key](value) : null;
    if (problem) {
      errors.push({ field: key, message: problem });
      return;
    }

    clean[key] = value;
  });

  if (errors.length > 0) throw ApiError.validation(errors, 'Hay opciones con valores no validos');

  const updated = await settingModel.updateMany(clean, userId);
  invalidate();
  return updated;
}

module.exports = {
  getAll,
  get,
  invalidate,
  update,
  getMapSettings,
  getSosPriority,
  getMaxPhotos,
  isPushEnabled,
};
