/**
 * my-emergencies.js - Lista de reportes del ciudadano (PWA).
 *
 * Usa carga incremental ("cargar mas") en lugar de paginacion numerada: en un
 * telefono se navega desplazando, y los numeros de pagina son incomodos de
 * acertar con el pulgar.
 */

import { initMobilePage } from './app.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { SOCKET_EVENTS } from '../core/config.js';
import { $, escapeHtml, timeAgo, formatDateTime, debounce } from '../core/utils.js';
import { notify } from '../core/ui.js';

const PAGE_SIZE = 10;

const state = { page: 1, status: '', total: 0, loading: false };

/** Tarjeta de un reporte. */
function card(emergency) {
  return `
    <a href="/app/emergency.html?id=${emergency.id}"
       class="m-card ${emergency.is_sos ? 'is-sos' : ''}"
       data-status="${escapeHtml(emergency.status_code)}">
      <div class="m-card__top">
        <span class="m-card__code">${escapeHtml(emergency.code)}</span>
        ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
      </div>
      <p class="m-card__title">${escapeHtml(emergency.title)}</p>
      <div class="m-card__meta">
        <span class="badge badge--status" data-status="${escapeHtml(emergency.status_code)}">
          ${escapeHtml(emergency.status_name)}
        </span>
        <span>${escapeHtml(emergency.type_name)}</span>
        <span>·</span>
        <span title="${escapeHtml(formatDateTime(emergency.reported_at))}">
          ${escapeHtml(timeAgo(emergency.reported_at))}
        </span>
      </div>
    </a>`;
}

function emptyState() {
  const filtered = state.status !== '';

  return `
    <div class="m-empty">
      <span class="m-empty__icon" aria-hidden="true">${filtered ? '🔍' : '📭'}</span>
      <p class="m-empty__title">
        ${filtered ? 'Sin reportes con ese estado' : 'Todavia no has reportado nada'}
      </p>
      <p class="m-empty__text">
        ${filtered
          ? 'Prueba con otro filtro.'
          : 'Cuando reportes una emergencia, aparecera aqui con su seguimiento.'}
      </p>
      ${filtered ? '' : `
        <a href="/app/report.html" class="btn btn--primary" style="margin-top: var(--space-2);">
          Reportar una emergencia
        </a>`}
    </div>`;
}

/**
 * Carga una pagina.
 * @param {boolean} append true = añadir al final; false = reemplazar.
 */
async function load({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  const list = $('#list');
  const moreButton = $('#btn-more');

  if (!append) {
    list.innerHTML = `
      <div class="m-empty">
        <span class="spinner" aria-hidden="true"></span>
        <p class="m-empty__text">Cargando tus reportes…</p>
      </div>`;
  }

  const params = { page: state.page, limit: PAGE_SIZE, sort: 'reported', order: 'desc' };
  if (state.status) params.status = state.status;

  try {
    const result = await api.get('/emergencies/mine', params);
    const items = result.items || [];
    const meta = result.meta;

    state.total = meta ? meta.total : items.length;

    if (!append) list.innerHTML = '';

    if (items.length === 0 && !append) {
      list.innerHTML = emptyState();
    } else {
      list.insertAdjacentHTML('beforeend', items.map(card).join(''));
    }

    moreButton.hidden = !(meta && meta.hasNextPage);

    $('#summary').textContent = state.total === 0
      ? 'Ningun reporte'
      : `${state.total} reporte(s) en total`;
  } catch (error) {
    if (!append) {
      list.innerHTML = `
        <div class="m-empty">
          <span class="m-empty__icon" aria-hidden="true">⚠</span>
          <p class="m-empty__title">No se pudieron cargar tus reportes</p>
          <p class="m-empty__text">${escapeHtml(error.message)}</p>
        </div>`;
    } else {
      notify.error('No se pudieron cargar mas reportes.');
    }
  } finally {
    state.loading = false;
  }
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await initMobilePage({ nav: 'list' });
  if (!user) return;

  $('#f-status').addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    load();
  });

  $('#btn-more').addEventListener('click', () => {
    state.page += 1;
    load({ append: true });
  });

  // Si cambia el estado de un reporte propio, la lista se refresca sola.
  const refresh = debounce(() => {
    state.page = 1;
    load();
  }, 800);

  [SOCKET_EVENTS.EMERGENCY_STATUS, SOCKET_EVENTS.EMERGENCY_ASSIGNED, SOCKET_EVENTS.EMERGENCY_NEW]
    .forEach((event) => realtime.on(event, refresh));

  await load();
}

init();
