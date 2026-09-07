/**
 * Creacion del pool de conexiones a PostgreSQL.
 *
 * Se usa el driver oficial "pg" con SQL puro (sin ORM): las consultas viven en
 * la capa de modelos y SIEMPRE son parametrizadas ($1, $2, ...) para evitar
 * inyeccion SQL.
 */

'use strict';

const { Pool, types } = require('pg');
const { config } = require('./env');
const logger = require('./logger');

/**
 * PostgreSQL devuelve NUMERIC como texto para no perder precision.
 * Latitud, longitud y los promedios de las estadisticas se usan como numeros
 * en el frontend, asi que se convierten aqui una sola vez.
 */
const PG_NUMERIC_OID = 1700;
types.setTypeParser(PG_NUMERIC_OID, (value) => (value === null ? null : Number.parseFloat(value)));

// BIGINT (COUNT(*)) tambien llega como texto; los conteos del dashboard caben
// sobradamente en un Number de JavaScript.
const PG_INT8_OID = 20;
types.setTypeParser(PG_INT8_OID, (value) => (value === null ? null : Number.parseInt(value, 10)));

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: config.database.poolMax,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  application_name: 'emergency-response-system',
});

pool.on('error', (error) => {
  logger.error('Error inesperado en un cliente inactivo del pool de PostgreSQL', error);
});

pool.on('connect', () => {
  logger.debug('Nueva conexion establecida con PostgreSQL');
});

module.exports = pool;
