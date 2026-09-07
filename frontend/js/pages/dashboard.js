/**
 * dashboard.js - Centro de control.
 *
 * Muestra los indicadores y la actividad, y se mantiene al dia por Socket.IO
 * sin recargar la pagina.
 *
 * Como se actualiza: los eventos NO traen los contadores calculados, solo
 * avisan de que algo cambio. Al recibir uno se vuelve a pedir el resumen a la
 * API. Asi las cifras siempre son las reales aunque lleguen dos eventos a la
 * vez, y no hay que replicar en el navegador la logica de conteo del backend.
 */

import { ROLES, ROUTES, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { notifyApiError, tableLoading, tableMessage } from '../core/ui.js';
import {
  $, escapeHtml, timeAgo, formatDuration, formatDateTime, formatCoords, debounce,
} from '../core/utils.js';

const ACTIVE_COLUMNS = 5;

/** Ultimos contadores pintados, para saber cual cambio y animarlo. */
let previousCounters = {};

/* ==========================================================================
   Indicadores
   ========================================================================== */

/** Escribe un valor y lo destaca si cambio respecto al anterior. */
function setKpi(key, value, { animate = true } = {}) {
  const node = document.querySelector(`[data-kpi="${key}"]`);
  if (!node) return;

  const changed = previousCounters[key] !== undefined && previousCounters[key] !== value;
  node.textContent = value;

  if (animate && changed) {
    node.classList.remove('is-updated');
    // Reiniciar la animacion exige forzar un reflow.
    void node.offsetWidth;
    node.classList.add('is-updated');
  }

  previousCounters[key] = value;
}

function renderCounters(data) {
  const counters = data.counters;

  setKpi('pendientes', counters.pendientes);
  setKpi('en_proceso', counters.en_proceso);
  setKpi('sos_activas', counters.sos_activas);
  setKpi('resueltas', counters.resueltas);
  setKpi('personal_disponible', counters.personal_disponible);

  $('#personal-hint').textContent =
    `de ${counters.personal_total} unidades · ${counters.personal_ocupado} ocupadas`;

  // El SOS solo se destaca cuando de verdad hay alguno activo.
  $('#kpi-sos').classList.toggle('has-active', counters.sos_activas > 0);

  const minutes = data.responseTime?.avg_response_minutes;
  setKpi('tiempo', minutes === null || minutes === undefined ? 'sin datos' : formatDuration(minutes));

  setSubtitle(
    `${counters.activas} emergencia(s) abiertas · ${counters.hoy} reportada(s) hoy · ` +
    `actualizado ${new Date().toLocaleTimeString('es-CO')}`
  );
}

/* ==========================================================================
   Emergencias activas
   ========================================================================== */

function emergencyRow(emergency) {
  return `
    <tr class="is-clickable ${emergency.is_sos ? 'is-sos' : ''}"
        data-id="${emergency.id}" tabindex="0">
      <td class="table__col-code">${escapeHtml(emergency.code)}</td>
      <td>
        <div class="type-tag">
          <span class="type-tag__icon" aria-hidden="true">${emergency.type_icon || '⚠'}</span>
          <span class="cell-stack">
            <strong class="cell-truncate">${escapeHtml(emergency.title)}</strong>
            <small>${escapeHtml(emergency.address || emergency.zone_name || 'Sin direccion')}</small>
          </span>
        </div>
      </td>
      <td class="table__col-narrow">
        <span class="badge badge--priority" data-priority="${emergency.priority_code}">
          ${escapeHtml(emergency.priority_name)}
        </span>
        ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
      </td>
      <td class="table__col-narrow">
        <span class="badge badge--status" data-status="${emergency.status_code}">
          ${escapeHtml(emergency.status_name)}
        </span>
      </td>
      <td class="table__col-narrow cell-time" title="${escapeHtml(formatDateTime(emergency.reported_at))}">
        ${escapeHtml(timeAgo(emergency.reported_at))}
      </td>
    </tr>`;
}

async function loadActiveEmergencies() {
  const body = $('#active-body');

  try {
    const result = await api.get('/emergencies', {
      active: 'true',
      limit: 12,
      sort: 'priority',
      order: 'desc',
    });

    const items = result.items || result;

    if (items.length === 0) {
      body.innerHTML = tableMessage(ACTIVE_COLUMNS, {
        icon: '✅',
        title: 'No hay emergencias activas',
        description: 'Todo esta atendido en este momento.',
      });
      return;
    }

    body.innerHTML = items.map(emergencyRow).join('');
  } catch (error) {
    body.innerHTML = tableMessage(ACTIVE_COLUMNS, {
      icon: '⚠',
      title: 'No se pudieron cargar las emergencias',
      description: error.message,
      variant: 'error',
    });
  }
}

/* ==========================================================================
   Unidades
   ========================================================================== */

const RESPONDER_ICONS = {
  PARAMEDICO: '🚑',
  BOMBERO: '🚒',
  POLICIA: '🚓',
  RESCATISTA: '🧗',
};

function unitItem(unit) {
  const position = unit.current_latitude
    ? formatCoords(unit.current_latitude, unit.current_longitude, 4)
    : 'Sin posicion';

  return `
    <div class="data-list__item" data-unit="${unit.id}">
      <span class="data-list__icon" aria-hidden="true">${RESPONDER_ICONS[unit.responder_type] || '🚨'}</span>
      <div class="data-list__body">
        <p class="data-list__title">${escapeHtml(unit.unit_code)} · ${escapeHtml(unit.full_name)}</p>
        <p class="data-list__meta">
          <span>${escapeHtml(unit.unit_name || unit.responder_type)}</span>
          <span>·</span>
          <span data-unit-position>${escapeHtml(position)}</span>
        </p>
      </div>
      <div class="data-list__aside">
        <span class="badge badge--responder" data-status="${unit.status}" data-unit-status>
          ${escapeHtml(unit.status.replace(/_/g, ' ').toLowerCase())}
        </span>
      </div>
    </div>`;
}

async function loadUnits() {
  const list = $('#units-list');

  try {
    const result = await api.get('/responders', { limit: 20, sort: 'status' });
    const items = result.items || result;

    list.innerHTML = items.length
      ? items.map(unitItem).join('')
      : '<p class="table-message__text" style="padding: var(--space-6);">No hay unidades registradas.</p>';
  } catch (error) {
    list.innerHTML = `<p class="table-message__text" style="padding: var(--space-6); color: var(--danger);">
      ${escapeHtml(error.message)}</p>`;
  }
}

/* ==========================================================================
   Datos y tiempo real
   ========================================================================== */

async function loadCounters() {
  try {
    const data = await api.get('/statistics/dashboard');
    renderCounters(data);
  } catch (error) {
    notifyApiError(error, 'No se pudieron cargar los indicadores');
  }
}

/** Recarga completa. Se agrupa con debounce para que una rafaga de eventos
 *  (por ejemplo una asignacion multiple) no dispare cinco peticiones. */
const refreshAll = debounce(async () => {
  await Promise.all([loadCounters(), loadActiveEmergencies()]);
}, 400);

function setupRealtime() {
  // Cambios que afectan a los contadores y al listado.
  [
    SOCKET_EVENTS.EMERGENCY_NEW,
    SOCKET_EVENTS.EMERGENCY_STATUS,
    SOCKET_EVENTS.EMERGENCY_ASSIGNED,
    SOCKET_EVENTS.EMERGENCY_UPDATE,
    SOCKET_EVENTS.STATS_UPDATE,
  ].forEach((event) => realtime.on(event, refreshAll));

  // Una unidad reporta su posicion: se actualiza solo esa fila, sin recargar
  // la lista entera. Estos eventos llegan cada pocos segundos.
  realtime.on(SOCKET_EVENTS.RESPONDER_LOCATION_UPDATE, (unit) => {
    const row = document.querySelector(`[data-unit="${unit.id}"]`);
    if (!row) return;

    const position = row.querySelector('[data-unit-position]');
    if (position) {
      position.textContent = formatCoords(unit.current_latitude, unit.current_longitude, 4);
    }
  });

  realtime.on(SOCKET_EVENTS.RESPONDER_STATUS_UPDATE, (unit) => {
    const row = document.querySelector(`[data-unit="${unit.id}"]`);
    if (!row) {
      loadUnits();
      return;
    }

    const badge = row.querySelector('[data-unit-status]');
    if (badge) {
      badge.dataset.status = unit.status;
      badge.textContent = unit.status.replace(/_/g, ' ').toLowerCase();
    }
  });
}

/** Ir al detalle al pulsar una fila (con raton o con teclado). */
function setupRowNavigation() {
  const body = $('#active-body');

  const open = (row) => {
    if (row && row.dataset.id) {
      window.location.href = `${ROUTES.emergencyDetail}?id=${row.dataset.id}`;
    }
  };

  body.addEventListener('click', (event) => open(event.target.closest('tr[data-id]')));

  body.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(event.target.closest('tr[data-id]'));
    }
  });
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth([ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Centro de control' });

  setupRowNavigation();
  setupRealtime();

  // Estado de carga mientras llegan los datos.
  $('#active-body').innerHTML = tableLoading(ACTIVE_COLUMNS, 'Cargando emergencias…');

  await Promise.all([loadCounters(), loadActiveEmergencies(), loadUnits()]);
}

init();
