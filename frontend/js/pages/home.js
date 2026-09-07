/**
 * home.js - Logica de la pagina de inicio (index.html).
 *
 * Comprueba en vivo que el entorno de desarrollo esta bien montado:
 *   1. El servidor API responde.
 *   2. PostgreSQL esta conectado.
 *   3. El frontend se esta sirviendo desde el mismo origen que la API
 *      (requisito de la PWA y de la Geolocation API).
 *   4. El navegador soporta geolocalizacion y service workers.
 */

import { CONFIG } from '../core/config.js';
import { api } from '../core/api.js';
import { $, escapeHtml } from '../core/utils.js';

/* --------------------------------------------------------------------------
 *  Fases del proyecto
 * ------------------------------------------------------------------------ */

const PHASES = [
  { n: 1,  name: 'Analisis y arquitectura',   done: true },
  { n: 2,  name: 'Estructura del proyecto',   done: true },
  { n: 3,  name: 'Base de datos PostgreSQL',  done: true },
  { n: 4,  name: 'Backend y API REST',        done: true },
  { n: 5,  name: 'Autenticacion y roles',     done: true },
  { n: 6,  name: 'Modulo de emergencias',     done: true },
  { n: 7,  name: 'Socket.IO tiempo real',     done: true },
  { n: 8,  name: 'Frontend web',              done: true },
  { n: 9,  name: 'Mapas Leaflet',             done: true },
  { n: 10, name: 'PWA instalable',            done: true },
  { n: 11, name: 'GPS y boton SOS',           done: true },
  { n: 12, name: 'Fotografias',               done: true },
  { n: 13, name: 'Notificaciones',            done: true },
  { n: 14, name: 'Estadisticas Chart.js',     done: true },
  { n: 15, name: 'Seguridad',                 done: true },
  { n: 16, name: 'Pruebas',                   done: true },
  { n: 17, name: 'Correccion de errores',     done: true },
  { n: 18, name: 'Documentacion final',       done: true },
];

/* --------------------------------------------------------------------------
 *  Utilidades de pintado
 * ------------------------------------------------------------------------ */

/**
 * Actualiza una tarjeta de estado.
 * @param {string} key    valor del atributo data-check
 * @param {'loading'|'ok'|'warn'|'error'} state
 * @param {string} value  texto principal
 * @param {string} detail texto secundario
 */
function setStatus(key, state, value, detail = '') {
  const card = $(`.status-card[data-check="${key}"]`);
  if (!card) return;
  card.querySelector('.status-card__dot').dataset.state = state;
  card.querySelector('[data-field="value"]').textContent = value;
  card.querySelector('[data-field="detail"]').textContent = detail;
}

function renderPhases() {
  const list = $('#phases-list');
  const done = PHASES.filter((phase) => phase.done).length;

  list.innerHTML = PHASES.map(
    (phase) => `
      <li class="phase ${phase.done ? 'phase--done' : 'phase--pending'}">
        <span class="phase__mark">${phase.done ? '✓' : phase.n}</span>
        <span class="phase__name">${escapeHtml(phase.name)}</span>
      </li>`
  ).join('');

  $('#progress-bar').style.width = `${(done / PHASES.length) * 100}%`;
  $('#phase-badge').textContent = done === PHASES.length
    ? `${done} de ${PHASES.length} · completado`
    : `${done} de ${PHASES.length} fases`;
}

/* --------------------------------------------------------------------------
 *  Comprobaciones
 * ------------------------------------------------------------------------ */

/** Comprueba el servidor y la base de datos con /api/health. */
async function checkBackend() {
  setStatus('server', 'loading', 'Comprobando…');
  setStatus('database', 'loading', 'Comprobando…');

  try {
    const health = await api.health();

    setStatus(
      'server',
      'ok',
      'En linea',
      `${health.service} v${health.version} · entorno ${health.environment}`
    );
    $('#version-badge').textContent = `v${health.version}`;
    $('#footer-env').textContent = `Entorno: ${health.environment} · Node ${health.host.node}`;

    if (health.database?.connected) {
      setStatus('database', 'ok', 'Conectada', health.database.version || 'PostgreSQL');
    } else {
      setStatus(
        'database',
        'warn',
        'Sin conexion',
        health.database?.error || 'Levantala con: npm run db:up'
      );
    }
    return true;
  } catch (error) {
    // /api/health responde 503 cuando el servidor vive pero la base de datos no.
    if (error.status === 503) {
      setStatus('server', 'ok', 'En linea', 'El servidor responde');
      setStatus(
        'database',
        'warn',
        'Sin conexion',
        error.data?.database?.error || 'Levantala con: npm run db:up'
      );
      return true;
    }
    setStatus('server', 'error', 'Sin respuesta', error.message);
    setStatus('database', 'error', 'No verificable', 'Primero debe responder el servidor');
    return false;
  }
}

/** Verifica que la pagina se sirve desde el backend y no como archivo suelto. */
function checkFrontendOrigin() {
  const { protocol, host } = window.location;

  if (protocol === 'file:') {
    setStatus(
      'frontend',
      'error',
      'Abierto como archivo',
      'Abre http://localhost:4000 en lugar de hacer doble clic en index.html'
    );
    return false;
  }

  const sameOrigin = CONFIG.api.baseUrl.startsWith('/');
  setStatus(
    'frontend',
    'ok',
    'Servido por HTTP',
    `${protocol}//${host} · API en ${sameOrigin ? 'el mismo origen' : CONFIG.api.baseUrl}`
  );
  return true;
}

/** Comprueba las capacidades del navegador que necesita la PWA. */
function checkBrowserCapabilities() {
  const hasGeo = 'geolocation' in navigator;
  const hasSW = 'serviceWorker' in navigator;
  const isSecure = window.isSecureContext;

  if (!hasGeo) {
    setStatus('geo', 'error', 'No disponible', 'Este navegador no soporta Geolocation API');
    return;
  }

  if (!isSecure) {
    setStatus(
      'geo',
      'warn',
      'Contexto no seguro',
      'La ubicacion solo funciona en https:// o en localhost'
    );
    return;
  }

  setStatus(
    'geo',
    'ok',
    'Disponible',
    `Geolocation ✓ · Service Worker ${hasSW ? '✓' : '✗'} · contexto seguro ✓`
  );
}

/* --------------------------------------------------------------------------
 *  Arranque
 * ------------------------------------------------------------------------ */

async function runChecks() {
  const button = $('#btn-recheck');
  button.classList.add('is-loading');
  button.disabled = true;

  checkFrontendOrigin();
  checkBrowserCapabilities();
  const backendOk = await checkBackend();

  // El mensaje se deriva del avance real: asi no se queda anclado a una fase.
  const pendientes = PHASES.filter((phase) => !phase.done);

  $('#status-hint').textContent = !backendOk
    ? 'El servidor no responde. Ejecuta "npm run dev" dentro de la carpeta backend.'
    : pendientes.length === 0
      ? 'Sistema completo: las 18 fases estan cerradas. Entra en http://localhost:4000/login.html'
      : `Entorno listo. Continua con la Fase ${pendientes[0].n}: ${pendientes[0].name.toLowerCase()}.`;

  button.classList.remove('is-loading');
  button.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  document.title = `${CONFIG.appName} · Estado del sistema`;
  renderPhases();
  runChecks();
  $('#btn-recheck').addEventListener('click', runChecks);
});
