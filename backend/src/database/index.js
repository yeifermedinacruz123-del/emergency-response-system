/**
 * Capa de acceso a datos de bajo nivel.
 *
 * Los modelos NO usan el pool directamente: usan estas tres funciones.
 *   query(text, params)  -> una consulta suelta
 *   transaction(fn)      -> varias consultas que deben confirmarse juntas
 *   checkConnection()    -> usado por /api/health
 */

'use strict';

const pool = require('../config/database');
const logger = require('../config/logger');
const { config } = require('../config/env');

/**
 * Ejecuta una consulta parametrizada.
 *
 * @param {string} text   SQL con marcadores $1, $2, ...
 * @param {Array}  params Valores de los marcadores.
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const startedAt = Date.now();
  try {
    const result = await pool.query(text, params);
    if (config.isDevelopment) {
      const ms = Date.now() - startedAt;
      const preview = text.replace(/\s+/g, ' ').trim().slice(0, 90);
      logger.debug(`SQL (${ms} ms, ${result.rowCount} filas): ${preview}`);
    }
    return result;
  } catch (error) {
    logger.error(`Error SQL: ${error.message}`, {
      sql: text.replace(/\s+/g, ' ').trim().slice(0, 200),
    });
    throw error;
  }
}

/** Devuelve la primera fila o null. Atajo muy usado en los modelos. */
async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/** Devuelve directamente el arreglo de filas. */
async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Ejecuta varias consultas dentro de una transaccion.
 * Si el callback lanza un error se hace ROLLBACK automaticamente.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} callback
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.warn(`Transaccion revertida: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Construye un mensaje entendible a partir del error de conexion.
 *
 * Node agrupa los intentos fallidos (IPv6 ::1 e IPv4 127.0.0.1) en un
 * AggregateError cuyo .message viene VACIO. Sin este traductor el arranque
 * mostraba "SIN CONEXION -> " sin decir el motivo.
 */
function describeConnectionError(error) {
  const causes = Array.isArray(error?.errors) ? error.errors : [error];
  const code = causes.map((item) => item?.code).find(Boolean);

  const EXPLANATIONS = {
    ECONNREFUSED: 'PostgreSQL no responde en ' + config.database.host + ':' + config.database.port + ' (el servicio no esta levantado)',
    ENOTFOUND: 'No se pudo resolver el host "' + config.database.host + '"',
    ETIMEDOUT: 'Tiempo de espera agotado al conectar con PostgreSQL',
    '28P01': 'Usuario o contrasena incorrectos (revisa DB_USER y DB_PASSWORD en backend/.env)',
    '3D000': 'La base de datos "' + config.database.name + '" no existe',
    '28000': 'El usuario "' + config.database.user + '" no tiene permiso de conexion',
  };

  if (code && EXPLANATIONS[code]) return EXPLANATIONS[code];

  const message = causes.map((item) => item?.message).find(Boolean);
  if (message) return code ? message + ' (' + code + ')' : message;

  return code ? 'Error de conexion ' + code : 'Error de conexion desconocido';
}

/**
 * Comprueba que la base de datos responde.
 * @returns {Promise<{connected: boolean, serverTime?: string, version?: string, error?: string}>}
 */
async function checkConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS server_time, version() AS version');
    return {
      connected: true,
      serverTime: result.rows[0].server_time,
      version: String(result.rows[0].version).split(' ').slice(0, 2).join(' ').replace(/,$/, ''),
    };
  } catch (error) {
    return { connected: false, error: describeConnectionError(error), code: error?.code || null };
  }
}

/** Cierra el pool. Se usa al apagar el servidor de forma ordenada. */
async function closePool() {
  await pool.end();
  logger.info('Pool de PostgreSQL cerrado');
}

module.exports = { pool, query, queryOne, queryAll, transaction, checkConnection, closePool };
