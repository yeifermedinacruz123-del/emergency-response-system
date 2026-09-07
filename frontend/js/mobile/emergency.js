/**
 * emergency.js - Seguimiento de una emergencia (vista del ciudadano).
 *
 * Responde la pregunta que se hace quien acaba de pedir ayuda: "que esta
 * pasando con mi reporte". Por eso lo primero es la linea de seguimiento, no
 * los datos administrativos.
 *
 * La pantalla se actualiza sola: si el operador asigna personal o cambia el
 * estado, el ciudadano lo ve sin recargar.
 */

import { initMobilePage, vibrate } from './app.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { SOCKET_EVENTS } from '../core/config.js';
import { createMiniMap, isLeafletReady } from '../components/map.js';
import { $, escapeHtml, formatDateTime, timeAgo, getParam, formatDuration } from '../core/utils.js';
import { notify, modal } from '../core/ui.js';

const emergencyId = Number.parseInt(getParam('id'), 10);

let emergency = null;

/* ==========================================================================
   Seguimiento por pasos
   ========================================================================== */

/**
 * Construye los pasos a partir de las marcas de tiempo reales.
 * Una emergencia cancelada no sigue el camino normal, asi que se muestra su
 * propio recorrido en lugar de dejar pasos colgando para siempre.
 */
function buildSteps() {
  if (emergency.status_code === 'CANCELADO') {
    return [
      { label: 'Reportada', at: emergency.reported_at, done: true },
      { label: 'Revisada por el centro de control', at: emergency.reported_at, done: true },
      { label: 'Cancelada', at: emergency.closed_at, done: true, final: true },
    ];
  }

  return [
    { label: 'Reportada', at: emergency.reported_at, done: true },
    { label: 'Recibida en el centro de control', at: emergency.reported_at, done: true },
    { label: 'Personal asignado', at: emergency.assigned_at, done: Boolean(emergency.assigned_at) },
    { label: 'Personal atendiendo', at: emergency.in_progress_at, done: Boolean(emergency.in_progress_at) },
    { label: 'Resuelta', at: emergency.resolved_at, done: Boolean(emergency.resolved_at) },
  ];
}

function trackerHtml() {
  const steps = buildSteps();
  const currentIndex = steps.findIndex((step) => !step.done);

  return `
    <section class="m-section">
      <h2 class="m-section__title">Seguimiento</h2>
      <div class="m-tracker">
        ${steps.map((step, index) => {
          const state = step.done ? 'is-done' : index === currentIndex ? 'is-current' : 'is-pending';
          const mark = step.done ? '✓' : index === currentIndex ? '●' : '○';

          return `
            <div class="m-tracker__step ${state}">
              <span class="m-tracker__mark" aria-hidden="true">${mark}</span>
              <div class="m-tracker__body">
                <p class="m-tracker__label">${escapeHtml(step.label)}</p>
                ${step.at
                  ? `<p class="m-tracker__time">${escapeHtml(formatDateTime(step.at))}</p>`
                  : index === currentIndex
                    ? '<p class="m-tracker__time">En curso…</p>'
                    : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

/* ==========================================================================
   Bloques
   ========================================================================== */

function headerHtml() {
  return `
    <section class="m-section">
      <div class="m-card ${emergency.is_sos ? 'is-sos' : ''}"
           data-status="${escapeHtml(emergency.status_code)}"
           style="cursor: default; margin-bottom: 0;">
        <div class="m-card__top">
          <span class="m-card__code">${escapeHtml(emergency.code)}</span>
          ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
        </div>
        <p class="m-card__title">${escapeHtml(emergency.title)}</p>
        <div class="m-card__meta">
          <span class="badge badge--status" data-status="${escapeHtml(emergency.status_code)}">
            ${escapeHtml(emergency.status_name)}
          </span>
          <span class="badge badge--priority" data-priority="${escapeHtml(emergency.priority_code)}">
            ${escapeHtml(emergency.priority_name)}
          </span>
        </div>
        ${emergency.description
          ? `<p style="margin-top: var(--space-3); font-size: var(--text-sm); color: var(--text-base); line-height: 1.5;">
               ${escapeHtml(emergency.description)}</p>`
          : ''}
      </div>
    </section>`;
}

/** Personal asignado. Es lo que mas tranquiliza al ciudadano. */
function assignmentsHtml() {
  const active = (emergency.assignments || []).filter((item) => item.status !== 'CANCELADO');

  if (active.length === 0) return '';

  const ICONS = { PARAMEDICO: '🚑', BOMBERO: '🚒', POLICIA: '🚓', RESCATISTA: '🧗' };

  return `
    <section class="m-section">
      <h2 class="m-section__title">Personal en camino</h2>
      ${active.map((item) => `
        <div class="m-card" style="cursor: default;">
          <div class="m-card__top">
            <span aria-hidden="true" style="font-size: var(--text-xl);">
              ${ICONS[item.responder_type] || '🚨'}
            </span>
            <span class="m-card__code">${escapeHtml(item.unit_code)}</span>
          </div>
          <p class="m-card__title" style="font-size: var(--text-sm);">
            ${escapeHtml(item.responder_name)}
          </p>
          <div class="m-card__meta">
            <span class="badge badge--neutral">
              ${escapeHtml(item.status.replace(/_/g, ' ').toLowerCase())}
            </span>
            <span>${escapeHtml(item.institution || item.responder_type)}</span>
          </div>
        </div>`).join('')}
    </section>`;
}

function locationHtml() {
  if (!emergency.latitude) return '';

  return `
    <section class="m-section">
      <h2 class="m-section__title">Ubicacion del reporte</h2>
      <div class="map-mini" id="detail-map"></div>
      <p class="field__hint" style="margin-top: var(--space-2);">
        ${escapeHtml(emergency.address || 'Sin direccion registrada')}
        ${emergency.zone_name ? ` · ${escapeHtml(emergency.zone_name)}` : ''}
      </p>
    </section>`;
}

function photosHtml() {
  const attachments = emergency.photos || [];
  if (attachments.length === 0) return '';

  // La nota de voz se guarda en la misma tabla que las fotos: el tipo MIME
  // es lo que distingue una imagen de un audio a la hora de mostrarlo.
  const images = attachments.filter((item) => !item.mime_type?.startsWith('audio/'));
  const audioNotes = attachments.filter((item) => item.mime_type?.startsWith('audio/'));

  return `
    ${images.length > 0 ? `
      <section class="m-section">
        <h2 class="m-section__title">Tus fotografias (${images.length})</h2>
        <div class="photo-picker">
          ${images.map((photo, index) => `
            <div class="photo-thumb" data-photo="${escapeHtml(photo.file_path)}" style="cursor: pointer;">
              <img src="${escapeHtml(photo.file_path)}" alt="Fotografia ${index + 1}" loading="lazy">
            </div>`).join('')}
        </div>
      </section>` : ''}

    ${audioNotes.map((audio) => `
      <section class="m-section">
        <h2 class="m-section__title">🎙️ Tu nota de voz</h2>
        <audio controls style="width: 100%;" src="${escapeHtml(audio.file_path)}"></audio>
      </section>`).join('')}`;
}

/** Historial en lenguaje del ciudadano, sin jerga interna. */
function historyHtml() {
  const history = emergency.history || [];
  if (history.length === 0) return '';

  return `
    <section class="m-section">
      <h2 class="m-section__title">Historial</h2>
      ${history.map((entry) => `
        <div class="m-card" style="cursor: default; padding: var(--space-3) var(--space-4);">
          <p style="font-size: var(--text-sm); color: var(--text-base); line-height: 1.45;">
            ${escapeHtml(entry.description)}
          </p>
          <p class="m-card__meta" style="margin-top: var(--space-2);">
            <span>${escapeHtml(formatDateTime(entry.created_at))}</span>
          </p>
        </div>`).join('')}
    </section>`;
}

/** Resumen de tiempos, solo cuando la emergencia ya se cerro. */
function summaryHtml() {
  if (!emergency.resolved_at) return '';

  const minutes = (new Date(emergency.resolved_at) - new Date(emergency.reported_at)) / 60000;

  return `
    <section class="m-section">
      <div class="card" style="text-align: center; background: var(--success-bg); border-color: var(--success);">
        <p style="font-size: var(--text-2xl);" aria-hidden="true">✅</p>
        <p style="font-weight: var(--weight-semibold); color: var(--success); margin: var(--space-2) 0;">
          Emergencia resuelta
        </p>
        <p style="font-size: var(--text-sm); color: var(--text-muted);">
          Atendida en ${escapeHtml(formatDuration(minutes))}
        </p>
        ${emergency.resolution_notes
          ? `<p style="font-size: var(--text-sm); color: var(--text-base); margin-top: var(--space-3); line-height: 1.5;">
               ${escapeHtml(emergency.resolution_notes)}</p>`
          : ''}
      </div>
    </section>`;
}

/* ==========================================================================
   Pintado
   ========================================================================== */

function render() {
  $('#header-code').textContent = emergency.code;
  document.title = `ERS · ${emergency.code}`;

  $('#detail').innerHTML = `
    ${headerHtml()}
    ${summaryHtml()}
    ${trackerHtml()}
    ${assignmentsHtml()}
    ${locationHtml()}
    ${photosHtml()}
    ${historyHtml()}`;

  // El mapa se monta cuando el contenedor ya esta en el documento.
  if (emergency.latitude && isLeafletReady() && document.getElementById('detail-map')) {
    createMiniMap('detail-map', emergency.latitude, emergency.longitude, emergency);
  }

  // Fotografias a pantalla completa.
  $('#detail').addEventListener('click', (event) => {
    const thumb = event.target.closest('[data-photo]');
    if (!thumb) return;

    modal({
      title: 'Fotografia',
      size: 'lg',
      content: `<img src="${escapeHtml(thumb.dataset.photo)}" alt="Fotografia" class="photo-full">`,
      actions: [{ label: 'Cerrar', variant: 'ghost' }],
    });
  });
}

async function load() {
  emergency = await api.get(`/emergencies/${emergencyId}`);
  render();
}

function renderError(title, text) {
  $('#detail').innerHTML = `
    <div class="m-empty">
      <span class="m-empty__icon" aria-hidden="true">⚠</span>
      <p class="m-empty__title">${escapeHtml(title)}</p>
      <p class="m-empty__text">${escapeHtml(text)}</p>
      <a href="/app/my-emergencies.html" class="btn btn--ghost" style="margin-top: var(--space-3);">
        Ver mis reportes
      </a>
    </div>`;
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await initMobilePage({ nav: 'list' });
  if (!user) return;

  $('#btn-back').addEventListener('click', () => {
    window.location.href = '/app/my-emergencies.html';
  });

  if (Number.isNaN(emergencyId)) {
    renderError('Falta el identificador', 'Abre el reporte desde tu lista.');
    return;
  }

  try {
    await load();
  } catch (error) {
    if (error.status === 404) renderError('El reporte no existe', 'Puede que haya sido eliminado.');
    else if (error.status === 403) renderError('No puedes ver este reporte', 'Solo puedes consultar los tuyos.');
    else renderError('No se pudo cargar', error.message);
    return;
  }

  // Seguimiento en vivo de ESTA emergencia.
  await realtime.subscribeToEmergency(emergencyId);

  const onChange = async (payload) => {
    if (payload && Number(payload.id) !== emergencyId) return;

    const previousStatus = emergency.status_code;
    await load();

    // Solo se avisa si de verdad cambio el estado, para no molestar por
    // cualquier actualizacion menor.
    if (emergency.status_code !== previousStatus) {
      vibrate([120, 60, 120]);
      notify.info(`Tu reporte ahora esta: ${emergency.status_name}`, 7000);
    }
  };

  [SOCKET_EVENTS.EMERGENCY_STATUS, SOCKET_EVENTS.EMERGENCY_ASSIGNED, SOCKET_EVENTS.EMERGENCY_UPDATE]
    .forEach((event) => realtime.on(event, onChange));

  window.addEventListener('beforeunload', () => {
    realtime.unsubscribeFromEmergency(emergencyId);
  });
}

init();
