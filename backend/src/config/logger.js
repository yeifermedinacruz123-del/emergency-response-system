/**
 * Logger minimo con niveles y colores.
 *
 * No se usa una libreria externa a proposito: el proyecto solo necesita
 * escribir por consola con nivel y marca de tiempo, y opcionalmente a archivo.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('./env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const COLORS = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m',
  reset: '\x1b[0m',
};

const currentLevel = LEVELS[config.logs.level] ?? LEVELS.info;

let fileStream = null;
if (config.logs.toFile) {
  const logDir = path.resolve(__dirname, '../../', config.logs.dir);
  fs.mkdirSync(logDir, { recursive: true });
  const fileName = `ers-${new Date().toISOString().slice(0, 10)}.log`;
  fileStream = fs.createWriteStream(path.join(logDir, fileName), { flags: 'a' });
}

function timestamp() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;

  const tag = level.toUpperCase().padEnd(5);
  const extra = meta === undefined ? '' : ` ${formatMeta(meta)}`;
  const plain = `[${timestamp()}] ${tag} ${message}${extra}`;

  // eslint-disable-next-line no-console
  console.log(`${COLORS[level]}${plain}${COLORS.reset}`);
  if (fileStream) fileStream.write(`${plain}\n`);
}

function formatMeta(meta) {
  if (meta instanceof Error) return meta.stack || meta.message;
  if (typeof meta === 'object') {
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  }
  return String(meta);
}

const logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
  /** Linea en blanco / separador visual, util al arrancar. */
  raw: (message) => console.log(message), // eslint-disable-line no-console
};

module.exports = logger;
