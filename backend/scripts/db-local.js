#!/usr/bin/env node
/**
 * PostgreSQL local sin instalador ni Docker.
 *
 * Usa los binarios reales de PostgreSQL 16 que descarga el paquete
 * "embedded-postgres" (dependencia SOLO de desarrollo) y controla el ciclo de
 * vida del servidor con initdb / pg_ctl, igual que una instalacion normal.
 *
 * Uso:
 *   node scripts/db-local.js start     Arranca el servidor (lo deja corriendo)
 *   node scripts/db-local.js stop      Lo detiene
 *   node scripts/db-local.js status    Dice si esta arriba
 *   node scripts/db-local.js sql       Abre una consola SQL interactiva
 *   node scripts/db-local.js reset     BORRA los datos y empieza de cero
 *
 * NOTA - la distribucion de embedded-postgres trae unicamente initdb, pg_ctl y
 * postgres: NO incluye los clientes psql ni createdb. Por eso todo lo que es
 * "hablar SQL" (crear la base, la consola interactiva, cargar archivos .sql)
 * se hace con el driver "pg" desde Node, no con la linea de comandos.
 *
 * IMPORTANTE - por que los datos NO viven dentro de la carpeta del proyecto:
 * el proyecto esta dentro de OneDrive. OneDrive sincroniza los archivos
 * mientras PostgreSQL los esta escribiendo, y eso puede corromper la base de
 * datos. Por eso el directorio de datos va en %LOCALAPPDATA%, fuera de
 * cualquier carpeta sincronizada. Se puede cambiar con PGDATA_DIR.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const { config } = require('../src/config/env');

/* ------------------------------------------------------------------ rutas */

/** Carpeta bin/ de los binarios descargados por embedded-postgres. */
function resolveBinDir() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const platformPackage = `@embedded-postgres/${platform}-${process.arch}`;

  let packageRoot;
  try {
    packageRoot = path.dirname(require.resolve(`${platformPackage}/package.json`));
  } catch {
    // Algunas versiones no exportan package.json: se usa la ruta directa.
    packageRoot = path.resolve(__dirname, '..', 'node_modules', platformPackage);
  }

  const binDir = path.join(packageRoot, 'native', 'bin');
  if (!fs.existsSync(binDir)) {
    fail(
      `No se encontraron los binarios de PostgreSQL en:\n    ${binDir}\n\n` +
        '  Instala las dependencias de desarrollo con:  npm install'
    );
  }
  return binDir;
}

const EXE = process.platform === 'win32' ? '.exe' : '';
let binDirCache = null;
function bin(name) {
  if (binDirCache === null) binDirCache = resolveBinDir();
  return path.join(binDirCache, name + EXE);
}

/**
 * Directorio de datos, FUERA de OneDrive por defecto.
 * Se puede forzar otro con PGDATA_DIR en backend/.env
 */
const DATA_DIR =
  process.env.PGDATA_DIR ||
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'),
    'ers-postgres',
    'data'
  );

const LOG_FILE = path.join(path.dirname(DATA_DIR), 'postgres.log');

/* ---------------------------------------------------------------- helpers */

function fail(message) {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

function info(message) {
  console.log(`  ${message}`);
}

/** Ejecuta uno de los binarios de PostgreSQL. */
function run(command, args, options = {}) {
  const { quiet, ...rest } = options;
  return spawnSync(bin(command), args, {
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    ...rest,
  });
}

/** true si pg_ctl reporta que el servidor esta arriba. */
function isRunning() {
  if (!fs.existsSync(DATA_DIR)) return false;
  return run('pg_ctl', ['status', '-D', DATA_DIR], { quiet: true }).status === 0;
}

/**
 * Abre una conexion con el driver "pg".
 * @param {string} database Base a la que conectarse.
 */
async function connect(database) {
  const client = new Client({
    host: 'localhost',
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database,
  });
  await client.connect();
  return client;
}

/* --------------------------------------------------------------- comandos */

/** initdb: crea el cluster con el usuario y la clave de backend/.env */
function initialise() {
  info('Creando el cluster de PostgreSQL en:');
  info(`    ${DATA_DIR}`);
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });

  // initdb recibe la clave por archivo para no dejarla en la linea de comandos.
  const passwordFile = path.join(os.tmpdir(), `ers-pg-pass-${process.pid}`);
  fs.writeFileSync(passwordFile, config.database.password, { mode: 0o600 });

  try {
    const result = run('initdb', [
      '-D', DATA_DIR,
      '-U', config.database.user,
      '--pwfile', passwordFile,
      '--encoding=UTF8',
      '--locale=C',
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
    ]);
    if (result.status !== 0) fail('initdb fallo. Revisa el mensaje anterior.');
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }

  info('Cluster creado correctamente.');
}

/**
 * Crea la base de datos de la aplicacion si todavia no existe.
 * Se hace por el driver porque la distribucion no trae createdb.
 */
async function ensureDatabase() {
  const client = await connect('postgres');
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database.name]
    );

    if (rowCount > 0) {
      info(`Base de datos "${config.database.name}" lista.`);
      return;
    }

    // CREATE DATABASE no admite parametros: el nombre se escapa con quote_ident.
    const { rows } = await client.query('SELECT quote_ident($1) AS name', [
      config.database.name,
    ]);
    await client.query(`CREATE DATABASE ${rows[0].name}`);
    info(`Base de datos "${config.database.name}" creada.`);
  } finally {
    await client.end();
  }
}

async function start() {
  if (isRunning()) {
    info('PostgreSQL ya estaba corriendo.');
    await ensureDatabase();
    return;
  }

  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) initialise();

  info(`Arrancando PostgreSQL en el puerto ${config.database.port}...`);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

  /*
   * stdio en "ignore" a proposito: pg_ctl deja corriendo al proceso postgres,
   * que heredaria la consola del script y la mantendria abierta para siempre.
   * Con "ignore" el servidor queda suelto y este script puede terminar.
   * La salida del servidor no se pierde: pg_ctl la escribe en LOG_FILE con -l.
   */
  const result = run(
    'pg_ctl',
    ['start', '-D', DATA_DIR, '-l', LOG_FILE, '-w', '-o', `-p ${config.database.port}`],
    { stdio: 'ignore' }
  );

  if (result.status !== 0) {
    const log = fs.existsSync(LOG_FILE)
      ? fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-12).join('\n    ')
      : '(el log todavia no existe)';
    fail(`pg_ctl no pudo arrancar el servidor.\n\n  Ultimas lineas de ${LOG_FILE}:\n    ${log}`);
  }

  await ensureDatabase();

  console.log('');
  info('PostgreSQL esta listo.');
  info(`  Host     : localhost:${config.database.port}`);
  info(`  Base     : ${config.database.name}`);
  info(`  Usuario  : ${config.database.user}`);
  info(`  Datos    : ${DATA_DIR}`);
  info(`  Log      : ${LOG_FILE}`);
  console.log('');
  info('Ahora puedes arrancar el backend con:  npm run dev');
  console.log('');
}

function stop() {
  if (!isRunning()) {
    info('PostgreSQL no estaba corriendo.');
    return;
  }
  if (run('pg_ctl', ['stop', '-D', DATA_DIR, '-m', 'fast', '-w']).status !== 0) {
    fail('No se pudo detener PostgreSQL.');
  }
  info('PostgreSQL detenido.');
}

function status() {
  if (!fs.existsSync(DATA_DIR)) {
    info('Todavia no existe el cluster. Crealo con:  npm run db:up');
    return;
  }
  info(isRunning() ? 'PostgreSQL esta CORRIENDO.' : 'PostgreSQL esta DETENIDO.');
  info(`Datos en: ${DATA_DIR}`);
}

/**
 * Consola SQL interactiva, en reemplazo de psql (que no viene en la
 * distribucion). Cada linea terminada en ";" se ejecuta contra la base.
 */
async function sql() {
  if (!isRunning()) fail('PostgreSQL no esta corriendo. Arrancalo con:  npm run db:up');

  const client = await connect(config.database.name);
  info(`Conectado a "${config.database.name}". Escribe \\q para salir.`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${config.database.name}=# `,
  });

  let buffer = '';
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    if (trimmed === '\\q' || trimmed === 'exit') {
      rl.close();
      return;
    }

    buffer += `${line}\n`;

    // Se espera al ";" para permitir consultas de varias lineas.
    if (!trimmed.endsWith(';')) {
      rl.setPrompt('... ');
      rl.prompt();
      return;
    }

    const statement = buffer.trim();
    buffer = '';

    try {
      const result = await client.query(statement);
      if (result.rows && result.rows.length > 0) {
        console.table(result.rows);
        console.log(`(${result.rowCount} filas)`);
      } else {
        console.log(`${result.command || 'OK'} ${result.rowCount ?? ''}`.trim());
      }
    } catch (error) {
      console.error(`ERROR: ${error.message}`);
    }

    rl.setPrompt(`${config.database.name}=# `);
    rl.prompt();
  });

  rl.on('close', async () => {
    await client.end();
    console.log('\n  Conexion cerrada.');
  });
}

/** Borra el cluster completo. Exige confirmacion explicita. */
function reset() {
  if (process.argv[3] !== '--force') {
    fail(
      'Esto BORRA todos los datos locales de PostgreSQL.\n' +
        '  Si estas seguro, ejecuta:  node scripts/db-local.js reset --force'
    );
  }
  if (isRunning()) stop();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  info('Cluster eliminado. Vuelve a crearlo con:  npm run db:up');
}

/* ------------------------------------------------------------------- main */

const COMMANDS = { start, stop, status, sql, reset };
const command = process.argv[2] || 'start';

if (!COMMANDS[command]) {
  fail(`Comando desconocido: "${command}". Usa: ${Object.keys(COMMANDS).join(' | ')}`);
}

Promise.resolve(COMMANDS[command]()).catch((error) => {
  fail(error.message);
});
