/**
 * Estadisticas del dashboard.
 *
 * Este servicio solo compone: cada cifra viene de una consulta SQL sobre los
 * datos reales. No hay ni un valor escrito a mano.
 */

'use strict';

const statisticsModel = require('../models/statistics.model');

/** Limita ?days= a un rango razonable. */
function parseDays(value, fallback = 30) {
  const days = Number.parseInt(value, 10);
  if (Number.isNaN(days) || days < 1) return fallback;
  return Math.min(days, 365);
}

/**
 * Todo lo que necesita la pantalla principal en una sola peticion.
 * Se lanzan en paralelo porque son consultas independientes.
 */
async function getDashboard(query = {}) {
  const days = parseDays(query.days, 14);

  const [counters, byDay, byType, byStatus, byPriority, responseTime] = await Promise.all([
    statisticsModel.getDashboard(),
    statisticsModel.getByDay(days),
    statisticsModel.getByType(),
    statisticsModel.getByStatus(),
    statisticsModel.getByPriority(),
    statisticsModel.getResponseTimeSummary(),
  ]);

  return {
    counters,
    charts: { byDay, byType, byStatus, byPriority },
    responseTime,
    generatedAt: new Date().toISOString(),
  };
}

/** Distribuciones para la pantalla de estadisticas. */
async function getEmergencyStatistics(query = {}) {
  const days = parseDays(query.days, 30);

  const [byDay, byType, byStatus, byPriority, byZone] = await Promise.all([
    statisticsModel.getByDay(days),
    statisticsModel.getByType(),
    statisticsModel.getByStatus(),
    statisticsModel.getByPriority(),
    statisticsModel.getByZone(),
  ]);

  return { days, byDay, byType, byStatus, byPriority, byZone };
}

/** Tiempos de respuesta: resumen, por prioridad y evolucion diaria. */
async function getResponseTime(query = {}) {
  const days = parseDays(query.days, 30);

  const [summary, byPriority, byDay, workload] = await Promise.all([
    statisticsModel.getResponseTimeSummary(),
    statisticsModel.getResponseTimeByPriority(),
    statisticsModel.getResponseTimeByDay(days),
    statisticsModel.getResponderWorkload(),
  ]);

  return { days, summary, byPriority, byDay, workload };
}

const getByDay = (query = {}) => statisticsModel.getByDay(parseDays(query.days, 30));
const getByType = () => statisticsModel.getByType();
const getByStatus = () => statisticsModel.getByStatus();
const getByPriority = () => statisticsModel.getByPriority();
const getByZone = () => statisticsModel.getByZone();

module.exports = {
  getDashboard,
  getEmergencyStatistics,
  getResponseTime,
  getByDay,
  getByType,
  getByStatus,
  getByPriority,
  getByZone,
};
