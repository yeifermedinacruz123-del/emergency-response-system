/**
 * Controlador de salud del sistema.
 * Lo usan /api/health y la pagina de inicio del frontend para comprobar que el
 * backend y la base de datos estan operativos.
 */

'use strict';

const os = require('os');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { checkConnection } = require('../database');
const { config } = require('../config/env');

const startedAt = Date.now();

/** GET /api/health */
const health = asyncHandler(async (req, res) => {
  const database = await checkConnection();

  const payload = {
    service: 'Emergency Response System API',
    version: require('../../package.json').version,
    environment: config.env,
    status: database.connected ? 'ok' : 'degraded',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    database: database.connected
      ? { connected: true, version: database.version, serverTime: database.serverTime }
      : { connected: false, error: database.error },
    host: { platform: os.platform(), node: process.version },
  };

  // 200 si todo esta bien, 503 si la base de datos no responde.
  return database.connected
    ? ApiResponse.ok(res, payload, 'El servicio esta operativo')
    : ApiResponse.send(res, 503, false, 'El servicio funciona pero la base de datos no responde', payload, null);
});

/** GET /api/config - parametros publicos que necesita el frontend. */
const publicConfig = asyncHandler(async (req, res) => {
  return ApiResponse.ok(
    res,
    {
      apiPrefix: config.server.apiPrefix,
      map: {
        city: config.geo.city,
        department: config.geo.department,
        center: { lat: config.geo.lat, lng: config.geo.lng },
        zoom: config.geo.zoom,
      },
      uploads: {
        maxFileSizeMB: config.storage.maxFileSizeBytes / (1024 * 1024),
        maxFiles: config.storage.maxFilesPerEmergency,
        allowedTypes: config.storage.allowedMimeTypes,
      },
      pushEnabled: config.push.enabled,
    },
    'Configuracion publica'
  );
});

module.exports = { health, publicConfig };
