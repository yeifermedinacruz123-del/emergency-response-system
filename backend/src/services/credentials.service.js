/**
 * credentials.service.js - Hoja de calculo con los usuarios y sus contrasenas.
 *
 * ADVERTENCIA IMPORTANTE
 * ----------------------
 * Este modulo guarda contrasenas EN TEXTO PLANO. Existe porque el sistema es
 * una entrega academica de demostracion y se necesita una lista de accesos
 * para las pruebas y la sustentacion. En un sistema real esto no debe existir:
 * la base de datos guarda solo el hash bcrypt, que es irreversible a proposito.
 *
 * Para desactivarlo por completo:  CREDENTIALS_SHEET_ENABLED=false
 *
 * Como funciona
 * -------------
 * El archivo .xlsx NO es la fuente de datos: se regenera entero cada vez. La
 * fuente son dos cosas que se combinan:
 *   1. La tabla `users` de PostgreSQL  -> quienes existen ahora mismo.
 *   2. `registro.json`                 -> la contrasena de los que se han
 *                                         creado desde que esto funciona.
 *
 * Se regenera en lugar de anadir una fila al final porque asi el Excel siempre
 * refleja la base: si el administrador borra un usuario, desaparece de la hoja.
 * Anadir filas sueltas habria dejado un archivo que se desincroniza solo.
 */

'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const ExcelJS = require('exceljs');

const { config } = require('../config/env');
const logger = require('../config/logger');
const { queryAll } = require('../database');

/* --------------------------------------------------------------------------
 *  Rutas y constantes
 * ------------------------------------------------------------------------ */

const STORAGE_DIR = path.resolve(__dirname, '../..', config.credentials.dir);
const LEDGER_FILE = path.join(STORAGE_DIR, 'registro.json');
const SHEET_FILE = path.join(STORAGE_DIR, config.credentials.fileName);

/** Nombre con el que se descarga desde el panel. */
const DOWNLOAD_NAME = config.credentials.fileName;

/**
 * Contrasena comun de los usuarios que vienen en `database/seed.sql`.
 * Esta documentada en ese mismo archivo; no es un secreto que se filtre aqui.
 */
const SEED_PASSWORD = config.credentials.seedPassword;

/** Origen de cada credencial, para que la hoja explique de donde sale. */
const SOURCES = {
  SEED: 'Demostracion (seed.sql)',
  ADMIN: 'Creado por el administrador',
  SELF: 'Registro ciudadano',
};

/* --------------------------------------------------------------------------
 *  Registro de contrasenas (registro.json)
 * ------------------------------------------------------------------------ */

/** Crea la carpeta si hace falta. */
async function ensureDir() {
  await fsp.mkdir(STORAGE_DIR, { recursive: true });
}

/**
 * Lee el registro. Si no existe o esta corrupto devuelve uno vacio: perder el
 * registro no puede impedir que se cree un usuario.
 */
async function readLedger() {
  try {
    const raw = await fsp.readFile(LEDGER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn('No se pudo leer el registro de credenciales; se empieza vacio', {
        error: error.message,
      });
    }
    return {};
  }
}

/** Guarda el registro. */
async function writeLedger(ledger) {
  await ensureDir();
  await fsp.writeFile(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

/**
 * Momento en que empezo a funcionar el registro. Sirve para distinguir a los
 * usuarios de la semilla (creados antes, con la contrasena documentada) de los
 * que se crearon despues sin pasar por aqui (contrasena desconocida).
 */
function ledgerStartedAt(ledger) {
  return ledger.__startedAt ? new Date(ledger.__startedAt) : null;
}

/* --------------------------------------------------------------------------
 *  Generacion del Excel
 * ------------------------------------------------------------------------ */

/** Usuarios actuales de la base, con su rol. */
async function fetchUsers() {
  return queryAll(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.document_type,
            u.document_number, u.phone, u.is_active, u.created_at,
            r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      ORDER BY r.id DESC, u.id ASC`
  );
}

/**
 * Decide que contrasena mostrar para un usuario.
 *
 * Hay tres casos y los tres se dicen tal cual en la hoja, sin inventar:
 *   - Esta en el registro          -> la contrasena real.
 *   - Es anterior al registro      -> la de la semilla, que esta documentada.
 *   - Es posterior y no se registro -> desconocida (solo existe el hash).
 */
function resolvePassword(user, ledger, startedAt) {
  const entry = ledger[user.email.toLowerCase()];

  if (entry) {
    return { password: entry.password, source: entry.source || SOURCES.ADMIN };
  }

  if (!startedAt || new Date(user.created_at) <= startedAt) {
    return { password: SEED_PASSWORD, source: SOURCES.SEED };
  }

  return { password: '(no registrada — solo existe el hash)', source: '—' };
}

/** Ancho de columnas y estilo de la cabecera. */
const COLUMNS = [
  { header: 'ID', key: 'id', width: 6 },
  { header: 'Nombre completo', key: 'name', width: 26 },
  { header: 'Rol', key: 'role', width: 22 },
  { header: 'Correo (usuario)', key: 'email', width: 30 },
  { header: 'Contrasena', key: 'password', width: 24 },
  { header: 'Documento', key: 'document', width: 16 },
  { header: 'Telefono', key: 'phone', width: 14 },
  { header: 'Estado', key: 'status', width: 10 },
  { header: 'Origen de la credencial', key: 'source', width: 28 },
  { header: 'Creado', key: 'createdAt', width: 20 },
];

/** Construye el libro completo en memoria. */
async function buildWorkbook() {
  const [users, ledger] = await Promise.all([fetchUsers(), readLedger()]);
  const startedAt = ledgerStartedAt(ledger);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Emergency Response System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Usuarios', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // ---- Titulo y aviso ----
  sheet.mergeCells('A1', 'J1');
  sheet.getCell('A1').value = 'Emergency Response System — Usuarios y contrasenas';
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF101A2E' } };
  sheet.getRow(1).height = 22;

  sheet.mergeCells('A2', 'J2');
  sheet.getCell('A2').value =
    'ARCHIVO DE DEMOSTRACION. Contiene contrasenas en texto plano y se regenera '
    + 'solo cada vez que el administrador crea un usuario. No debe publicarse ni '
    + 'subirse al repositorio.';
  sheet.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF9A3412' } };
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(2).height = 26;

  sheet.mergeCells('A3', 'J3');
  sheet.getCell('A3').value = `Generado el ${new Date().toLocaleString('es-CO')} · ${users.length} usuario(s)`;
  sheet.getCell('A3').font = { size: 9, color: { argb: 'FF64748B' } };

  // ---- Cabecera de la tabla ----
  const header = sheet.getRow(4);
  COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101A2E' } };
    cell.alignment = { vertical: 'middle' };
    sheet.getColumn(index + 1).width = column.width;
  });
  header.height = 20;

  // ---- Filas ----
  users.forEach((user, index) => {
    const { password, source } = resolvePassword(user, ledger, startedAt);

    const row = sheet.getRow(5 + index);
    row.values = [
      user.id,
      `${user.first_name} ${user.last_name}`,
      user.role_name,
      user.email,
      password,
      `${user.document_type} ${user.document_number}`,
      user.phone || '—',
      user.is_active ? 'Activo' : 'Inactivo',
      source,
      new Date(user.created_at).toLocaleString('es-CO'),
    ];

    // Las contrasenas en monoespaciada: se leen mejor al teclearlas.
    row.getCell(5).font = { name: 'Consolas', size: 10 };

    if (index % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
    if (!user.is_active) {
      row.getCell(8).font = { color: { argb: 'FF94A3B8' } };
    }
  });

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUMNS.length } };

  return workbook;
}

/* --------------------------------------------------------------------------
 *  API del modulo
 * ------------------------------------------------------------------------ */

/**
 * Regenera el archivo .xlsx en disco.
 * Nunca lanza: que falle la hoja de demostracion no puede tumbar la creacion
 * de un usuario, que es la operacion importante.
 */
async function regenerate() {
  if (!config.credentials.enabled) return null;

  try {
    await ensureDir();
    const workbook = await buildWorkbook();
    await workbook.xlsx.writeFile(SHEET_FILE);
    logger.info('Hoja de credenciales actualizada', { file: SHEET_FILE });
    return SHEET_FILE;
  } catch (error) {
    logger.error('No se pudo generar la hoja de credenciales', { error: error.message });
    return null;
  }
}

/**
 * Anota la contrasena de un usuario recien creado y regenera el Excel.
 *
 * @param {string} email
 * @param {string} password Texto plano, tal como lo escribio quien lo creo.
 * @param {'ADMIN'|'SELF'} origin
 */
async function record(email, password, origin = 'ADMIN') {
  if (!config.credentials.enabled) return;

  try {
    const ledger = await readLedger();

    // La primera anotacion marca desde cuando existe el registro.
    if (!ledger.__startedAt) ledger.__startedAt = new Date().toISOString();

    ledger[String(email).toLowerCase()] = {
      password,
      source: SOURCES[origin] || SOURCES.ADMIN,
      recordedAt: new Date().toISOString(),
    };

    await writeLedger(ledger);
    await regenerate();
  } catch (error) {
    logger.error('No se pudo anotar la credencial', { error: error.message });
  }
}

/**
 * Devuelve el libro listo para descargar, generandolo al vuelo.
 * Se genera en el momento en vez de leer el archivo para que la descarga
 * refleje la base aunque el archivo de disco se haya borrado.
 */
async function buildBuffer() {
  const workbook = await buildWorkbook();
  return workbook.xlsx.writeBuffer();
}

/** Ruta del archivo en disco, solo para mostrarla en la interfaz. */
function sheetPath() {
  return SHEET_FILE;
}

/** ¿Existe ya el archivo? */
function sheetExists() {
  return fs.existsSync(SHEET_FILE);
}

module.exports = {
  record,
  regenerate,
  buildBuffer,
  sheetPath,
  sheetExists,
  DOWNLOAD_NAME,
  SOURCES,
};
