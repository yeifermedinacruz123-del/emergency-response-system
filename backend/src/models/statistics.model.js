/**
 * Consultas de estadisticas para el dashboard y los graficos.
 *
 * Todo sale de la base de datos: no hay ni un numero escrito a mano. Cada
 * consulta devuelve ya el formato que espera Chart.js (etiqueta + valor), para
 * que el frontend no tenga que transformar nada.
 */

'use strict';

const { queryAll, queryOne } = require('../database');

/** Tarjetas del dashboard: una sola fila con todos los contadores. */
async function getDashboard() {
  return queryOne('SELECT * FROM v_dashboard_counters');
}

/**
 * Serie temporal de los ultimos N dias.
 *
 * generate_series rellena los dias SIN emergencias con 0. Sin eso, el grafico
 * saltaria del dia 3 al dia 7 y la linea mentiria sobre la tendencia.
 */
async function getByDay(days = 30) {
  return queryAll(
    `WITH dias AS (
       SELECT generate_series(
         (CURRENT_DATE - ($1::INT - 1) * INTERVAL '1 day')::DATE,
         CURRENT_DATE,
         INTERVAL '1 day'
       )::DATE AS dia
     )
     SELECT d.dia AS date,
            TO_CHAR(d.dia, 'DD/MM')                       AS label,
            COUNT(e.id)                                   AS total,
            COUNT(e.id) FILTER (WHERE e.is_sos)           AS sos,
            COUNT(e.id) FILTER (WHERE e.status_code = 'RESUELTO') AS resueltas
       FROM dias d
       LEFT JOIN v_emergencies_full e
              ON e.reported_at::DATE = d.dia AND NOT e.is_deleted
      GROUP BY d.dia
      ORDER BY d.dia`,
    [days]
  );
}

/** Distribucion por tipo. Incluye los tipos sin emergencias, con 0. */
async function getByType() {
  return queryAll(
    `SELECT t.code, t.name AS label, t.color, t.icon,
            COUNT(e.id) AS total
       FROM emergency_types t
       LEFT JOIN emergencies e ON e.type_id = t.id AND NOT e.is_deleted
      WHERE t.is_active
      GROUP BY t.id, t.code, t.name, t.color, t.icon
      ORDER BY total DESC, t.name`
  );
}

/** Distribucion por estado. */
async function getByStatus() {
  return queryAll(
    `SELECT s.code, s.name AS label, s.color,
            COUNT(e.id) AS total
       FROM emergency_status s
       LEFT JOIN emergencies e ON e.status_id = s.id AND NOT e.is_deleted
      GROUP BY s.id, s.code, s.name, s.color, s.sort_order
      ORDER BY s.sort_order`
  );
}

/** Distribucion por prioridad. */
async function getByPriority() {
  return queryAll(
    `SELECT p.code, p.name AS label, p.color, p.level,
            COUNT(e.id) AS total
       FROM priorities p
       LEFT JOIN emergencies e ON e.priority_id = p.id AND NOT e.is_deleted
      GROUP BY p.id, p.code, p.name, p.color, p.level
      ORDER BY p.level DESC`
  );
}

/** Distribucion por zona, incluyendo las emergencias sin zona asignada. */
async function getByZone() {
  return queryAll(
    `SELECT COALESCE(z.name, 'Sin zona') AS label,
            z.code,
            COUNT(e.id) AS total
       FROM v_emergencies_full e
       LEFT JOIN zones z ON z.id = e.zone_id
      WHERE NOT e.is_deleted
      GROUP BY z.id, z.name, z.code
      ORDER BY total DESC, label`
  );
}

/**
 * Tiempo de respuesta.
 *   promedio de asignacion  = reporte -> personal asignado
 *   promedio de resolucion  = reporte -> emergencia resuelta
 */
async function getResponseTimeSummary() {
  return queryOne(
    `SELECT
       ROUND(AVG(response_minutes)::NUMERIC, 1)   AS avg_response_minutes,
       ROUND(AVG(resolution_minutes)::NUMERIC, 1) AS avg_resolution_minutes,
       ROUND(MIN(response_minutes)::NUMERIC, 1)   AS min_response_minutes,
       ROUND(MAX(response_minutes)::NUMERIC, 1)   AS max_response_minutes,
       COUNT(*) FILTER (WHERE response_minutes IS NOT NULL)   AS assigned_count,
       COUNT(*) FILTER (WHERE resolution_minutes IS NOT NULL) AS resolved_count
     FROM v_response_time`
  );
}

/** Tiempo promedio de respuesta por prioridad, frente a su objetivo. */
async function getResponseTimeByPriority() {
  return queryAll(
    `SELECT p.code, p.name AS label, p.color, p.target_minutes,
            ROUND(AVG(v.response_minutes)::NUMERIC, 1) AS avg_response_minutes,
            COUNT(v.id) FILTER (WHERE v.response_minutes IS NOT NULL) AS total
       FROM priorities p
       LEFT JOIN v_response_time v ON v.priority_code = p.code
      GROUP BY p.id, p.code, p.name, p.color, p.target_minutes, p.level
      ORDER BY p.level DESC`
  );
}

/** Evolucion del tiempo de respuesta por dia, para la grafica de linea. */
async function getResponseTimeByDay(days = 30) {
  return queryAll(
    `WITH dias AS (
       SELECT generate_series(
         (CURRENT_DATE - ($1::INT - 1) * INTERVAL '1 day')::DATE,
         CURRENT_DATE,
         INTERVAL '1 day'
       )::DATE AS dia
     )
     SELECT d.dia AS date,
            TO_CHAR(d.dia, 'DD/MM') AS label,
            ROUND(AVG(v.response_minutes)::NUMERIC, 1) AS avg_response_minutes
       FROM dias d
       LEFT JOIN v_response_time v ON v.reported_at::DATE = d.dia
      GROUP BY d.dia
      ORDER BY d.dia`,
    [days]
  );
}

/** Carga de trabajo por unidad: cuantas emergencias ha atendido cada una. */
async function getResponderWorkload() {
  return queryAll(
    `SELECT r.unit_code AS label, r.responder_type, r.status,
            COUNT(a.id) FILTER (WHERE a.status = 'COMPLETADO') AS completadas,
            COUNT(a.id) FILTER (WHERE a.status IN ('ASIGNADO','EN_CAMINO','EN_SITIO')) AS activas,
            COUNT(a.id) AS total
       FROM v_responders_full r
       LEFT JOIN assignments a ON a.responder_id = r.id
      WHERE r.is_active
      GROUP BY r.id, r.unit_code, r.responder_type, r.status
      ORDER BY total DESC, r.unit_code`
  );
}

module.exports = {
  getDashboard,
  getByDay,
  getByType,
  getByStatus,
  getByPriority,
  getByZone,
  getResponseTimeSummary,
  getResponseTimeByPriority,
  getResponseTimeByDay,
  getResponderWorkload,
};
