/**
 * map.js - Mapa del centro de control.
 *
 * Pinta las emergencias y las unidades sobre OpenStreetMap y las mantiene al
 * dia por Socket.IO: una emergencia nueva aparece sola y una unidad que se
 * mueve se desplaza sin recargar el mapa.
 */

import { ROLES, ROUTES, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import {
  createMap, MarkerLayer, fitToMarkers, isLeafletReady, createHeatLayer, isHeatReady,
} from '../components/map.js';
import { notify, notifyApiError } from '../core/ui.js';
import { $, escapeHtml, timeAgo, debounce } from '../core/utils.js';

let map = null;
let emergencyLayer = null;
let unitLayer = null;
let heatLayer = null;

/** Ultimos datos recibidos, para poder repintar la lista sin volver a pedir. */
let currentEmergencies = [];
let currentUnits = [];

const filters = { status: '', type: '', sos: '' };

/* ==========================================================================
   Carga de datos
   ========================================================================== */

/** Parametros que entiende GET /api/emergencies/map */
function buildParams() {
  const params = {};

  if (filters.status === 'all') {
    // Sin el filtro de activas, el backend devuelve tambien las cerradas.
    params.active = 'false';
  } else if (filters.status) {
    params.status = filters.status;
  }

  if (filters.type) params.type = filters.type;
  if (filters.sos) params.sos = filters.sos;

  return params;
}

async function loadMapData({ fit = false } = {}) {
  try {
    const data = await api.get('/emergencies/map', buildParams());

    currentEmergencies = data.emergencies || [];
    currentUnits = data.responders || [];

    emergencyLayer.setAll(currentEmergencies);
    unitLayer.setAll(currentUnits);

    renderList();
    updateBadge();

    if (fit) fitToMarkers(map, [emergencyLayer, unitLayer]);
  } catch (error) {
    notifyApiError(error, 'No se pudieron cargar los datos del mapa');
  }
}

/**
 * Mapa de calor con el historico completo de emergencias (no solo las
 * activas, ni las que cumplen los filtros de la lista): la idea es ver que
 * zonas concentran incidentes con el tiempo, no la foto del momento.
 * Se pide una sola vez, la primera vez que se activa la capa.
 */
async function loadHeatLayer() {
  if (heatLayer || !isHeatReady()) return;

  try {
    const data = await api.get('/emergencies/map', { active: 'false' });
    heatLayer = createHeatLayer(data.emergencies || []);
  } catch (error) {
    notifyApiError(error, 'No se pudo cargar el mapa de calor');
  }
}

/** Contador flotante sobre el mapa. */
function updateBadge() {
  const sos = currentEmergencies.filter((item) => item.is_sos).length;

  $('#map-badge').innerHTML = `
    <span>${currentEmergencies.length} emergencia(s)</span>
    <span aria-hidden="true">·</span>
    <span>${currentUnits.length} unidad(es)</span>
    ${sos > 0 ? `<span class="badge badge--sos">${sos} SOS</span>` : ''}`;

  setSubtitle(`${currentEmergencies.length} emergencia(s) en el mapa`);
}

/* ==========================================================================
   Lista lateral
   ========================================================================== */

/** Lista de lo que hay en el mapa. Al pulsar se centra en el marcador. */
function renderList() {
  const list = $('#map-list');

  if (currentEmergencies.length === 0) {
    list.innerHTML = `<p class="table-message__text" style="padding: var(--space-6);">
      No hay emergencias que mostrar con estos filtros.</p>`;
    return;
  }

  // Las mas urgentes primero, igual que en el dashboard.
  const sorted = [...currentEmergencies].sort((a, b) => {
    if (a.is_sos !== b.is_sos) return a.is_sos ? -1 : 1;
    if (a.priority_level !== b.priority_level) return b.priority_level - a.priority_level;
    return new Date(b.reported_at) - new Date(a.reported_at);
  });

  list.innerHTML = sorted
    .map((emergency) => `
      <button type="button" class="data-list__item" data-focus="${emergency.id}"
              style="width:100%; text-align:left; background:none; border:none; border-bottom:1px solid var(--border-soft); cursor:pointer;">
        <span class="data-list__icon" aria-hidden="true">${emergency.type_icon || '⚠'}</span>
        <span class="data-list__body">
          <span class="data-list__title">${escapeHtml(emergency.title)}</span>
          <span class="data-list__meta">
            <span>${escapeHtml(emergency.code)}</span>
            <span>·</span>
            <span>${escapeHtml(timeAgo(emergency.reported_at))}</span>
          </span>
        </span>
        <span class="data-list__aside">
          ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
          <span class="badge badge--priority" data-priority="${emergency.priority_code}">
            ${escapeHtml(emergency.priority_name)}
          </span>
        </span>
      </button>`)
    .join('');
}

/* ==========================================================================
   Tiempo real
   ========================================================================== */

function setupRealtime() {
  /** Decide si una emergencia entra en la vista actual segun los filtros. */
  const matchesFilters = (emergency) => {
    if (filters.type && emergency.type_code !== filters.type) return false;
    if (filters.sos === 'true' && !emergency.is_sos) return false;

    if (filters.status === 'all') return true;
    if (filters.status) return emergency.status_code === filters.status;

    return emergency.status_code === 'PENDIENTE' || emergency.status_code === 'EN_PROCESO';
  };

  /** Inserta o quita una emergencia del mapa segun su nuevo estado. */
  const applyEmergency = (emergency) => {
    const index = currentEmergencies.findIndex((item) => item.id === emergency.id);

    if (!matchesFilters(emergency)) {
      // Ha dejado de cumplir los filtros (por ejemplo, se resolvio).
      if (index >= 0) currentEmergencies.splice(index, 1);
      emergencyLayer.remove(emergency.id);
      renderList();
      updateBadge();
      return;
    }

    if (index >= 0) currentEmergencies[index] = emergency;
    else currentEmergencies.push(emergency);

    emergencyLayer.upsert(emergency);
    renderList();
    updateBadge();
  };

  realtime.on(SOCKET_EVENTS.EMERGENCY_NEW, (emergency) => {
    applyEmergency(emergency);

    // Una emergencia nueva merece que el mapa la señale; un SOS, ademas, que
    // el operador la vea sin buscarla.
    if (emergency.is_sos) {
      emergencyLayer.focus(emergency.id, 15);
      notify.error(`🆘 SOS en ${emergency.address || 'ubicacion sin direccion'}`, 10000);
    }
  });

  [SOCKET_EVENTS.EMERGENCY_STATUS, SOCKET_EVENTS.EMERGENCY_UPDATE, SOCKET_EVENTS.EMERGENCY_ASSIGNED]
    .forEach((event) => realtime.on(event, applyEmergency));

  // Movimiento de una unidad: se desplaza su marcador, nada mas.
  realtime.on(SOCKET_EVENTS.RESPONDER_LOCATION_UPDATE, (unit) => {
    const index = currentUnits.findIndex((item) => item.id === unit.id);
    if (index >= 0) currentUnits[index] = { ...currentUnits[index], ...unit };
    else currentUnits.push(unit);

    unitLayer.upsert(unit);
  });

  realtime.on(SOCKET_EVENTS.RESPONDER_STATUS_UPDATE, debounce(() => loadMapData(), 500));
}

/* ==========================================================================
   Controles
   ========================================================================== */

function setupControls() {
  $('#layer-emergencies').addEventListener('change', (event) => {
    emergencyLayer.setVisible(event.target.checked);
  });

  $('#layer-units').addEventListener('change', (event) => {
    unitLayer.setVisible(event.target.checked);
  });

  $('#layer-heatmap').addEventListener('change', async (event) => {
    if (!isHeatReady()) {
      notify.warning('El mapa de calor no se pudo cargar');
      event.target.checked = false;
      return;
    }

    if (!heatLayer) await loadHeatLayer();
    if (!heatLayer) return;

    if (event.target.checked) heatLayer.addTo(map);
    else map.removeLayer(heatLayer);
  });

  ['#f-status', '#f-type', '#f-sos'].forEach((selector) => {
    $(selector).addEventListener('change', (event) => {
      const key = selector.replace('#f-', '');
      filters[key] = event.target.value;
      loadMapData();
    });
  });

  $('#btn-fit').addEventListener('click', () => {
    fitToMarkers(map, [emergencyLayer, unitLayer]);
  });

  $('#btn-refresh').addEventListener('click', () => loadMapData({ fit: true }));

  // Al pulsar un elemento de la lista, el mapa vuela hasta su marcador.
  $('#map-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-focus]');
    if (!button) return;

    const id = Number.parseInt(button.dataset.focus, 10);
    if (!emergencyLayer.focus(id)) {
      notify.warning('Ese punto no esta visible con los filtros actuales');
    }
  });
}

/** Rellena el filtro de tipos con el catalogo real. */
async function loadTypes() {
  try {
    const types = await api.get('/catalogs/types');
    const select = $('#f-type');

    types.forEach((type) => {
      const option = document.createElement('option');
      option.value = type.code;
      option.textContent = `${type.icon} ${type.name}`;
      select.appendChild(option);
    });
  } catch {
    // Sin catalogo el mapa sigue funcionando: solo falta ese filtro.
  }
}

/* -------------------------------------------------------------------------- */

function showMapError(message) {
  $('#map').innerHTML = `
    <div class="map-error">
      <span style="font-size: var(--text-3xl);" aria-hidden="true">🗺️</span>
      <p class="table-message__title">${escapeHtml(message)}</p>
      <p class="table-message__text">
        Comprueba que existe la carpeta <code>frontend/vendor/leaflet</code>.
      </p>
    </div>`;
  $('#map-badge').hidden = true;
}

async function init() {
  const user = await requireAuth([ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Mapa del centro de control' });

  if (!isLeafletReady()) {
    showMapError('No se pudo cargar la libreria del mapa');
    return;
  }

  map = createMap('map');
  if (!map) {
    showMapError('No se pudo inicializar el mapa');
    return;
  }

  emergencyLayer = new MarkerLayer(map, {
    kind: 'emergency',
    detailUrlBuilder: (emergency) => `${ROUTES.emergencyDetail}?id=${emergency.id}`,
  });

  unitLayer = new MarkerLayer(map, { kind: 'unit' });

  setupControls();
  setupRealtime();

  await loadTypes();
  await loadMapData({ fit: true });
}

init();
