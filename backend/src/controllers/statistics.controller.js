/**
 * Controladores de /api/statistics
 *
 * Cada respuesta ya viene con la forma que consume Chart.js: una lista de
 * { label, total, color }. El frontend solo la pasa al grafico.
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const statisticsService = require('../services/statistics.service');

/** GET /api/statistics/dashboard */
const dashboard = asyncHandler(async (req, res) => {
  const data = await statisticsService.getDashboard(req.query);
  return ApiResponse.ok(res, data, 'Indicadores del dashboard');
});

/** GET /api/statistics/emergencies */
const emergencies = asyncHandler(async (req, res) => {
  const data = await statisticsService.getEmergencyStatistics(req.query);
  return ApiResponse.ok(res, data, 'Estadisticas de emergencias');
});

/** GET /api/statistics/response-time */
const responseTime = asyncHandler(async (req, res) => {
  const data = await statisticsService.getResponseTime(req.query);
  return ApiResponse.ok(res, data, 'Tiempos de respuesta');
});

const byDay = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await statisticsService.getByDay(req.query), 'Emergencias por dia')
);

const byType = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await statisticsService.getByType(), 'Emergencias por tipo')
);

const byStatus = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await statisticsService.getByStatus(), 'Emergencias por estado')
);

const byPriority = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await statisticsService.getByPriority(), 'Emergencias por prioridad')
);

const byZone = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await statisticsService.getByZone(), 'Emergencias por zona')
);

module.exports = {
  dashboard,
  emergencies,
  responseTime,
  byDay,
  byType,
  byStatus,
  byPriority,
  byZone,
};
