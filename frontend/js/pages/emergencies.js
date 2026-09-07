/**
 * emergencies.js - Listado de emergencias.
 *
 * Una sola pagina sirve a los tres perfiles, porque el trabajo es el mismo
 * (buscar, filtrar y abrir) y solo cambia el conjunto de datos:
 *
 *   operador / admin  ->  GET /emergencies           todas, con filtros
 *   personal          ->  GET /emergencies/assigned  las que atiende
 *   ciudadano         ->  GET /emergencies/mine      las que reporto
 *
 * Los filtros que no aplican a un rol se ocultan (data-control-room) y ademas
 * el backend los ignoraria: la restriccion real esta alli.
 */

import { ROLES, ROUTES, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth, session } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { tableLoading, tableMessage, notify } from '../core/ui.js';
import {
  $, $$, escapeHtml, timeAgo, formatDateTime, debounce, buildQuery,
} from '../core/utils.js';

/** Estado de la vista. Es la unica fuente de verdad de lo que se muestra. */
const state = {
  endpoint: '/emergencies',
  page: 1,
  limit: 20,
  sort: 'reported',
  order: 'desc',
  filters: { search: '', status: '', type: '', priority: '', zone: '', sos: '' },
  total: 0,
  isControlRoom: false,
};

let columnCount = 7;

/* ==========================================================================
   Catalogos de los filtros
   ========================================================================== */

/** Rellena un <select> con los codigos y nombres del catalogo. */
function fillSelect(id, items, { valueKey = 'code', labelKey = 'name' } = {}) {
  const select = $(id);
  if (!select) return;

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item[valueKey];
    option.textContent = item[labelKey];
    select.appendChild(option);
  });
}

async function loadCatalogs() {
  try {
    const catalogs = await api.get('/catalogs');
    fillSelect('#f-status', catalogs.statuses);
    fillSelect('#f-type', catalogs.types);
    fillSelect('#f-priority', catalogs.priorities);
    fillSelect('#f-zone', catalogs.zones, { valueKey: 'id' });
  } catch {
    notify.warning('No se pudieron cargar los filtros. Puedes seguir buscando por texto.');
  }
}

/* ==========================================================================
   Filas
   ========================================================================== */

function row(emergency) {
  const assigned = emergency.assignment_count > 0
    ? `<span class="badge badge--info">${emergency.assignment_count} unidad(es)</span>`
    : '<span class="text-subtle" style="font-size: var(--text-xs);">Sin asignar</span>';

  const citizenCell = state.isControlRoom
    ? `<td>
         <span class="cell-stack">
           <strong>${escapeHtml(emergency.reporter_name)}</strong>
           <small>${escapeHtml(emergency.reporter_phone || emergency.reporter_email || '')}</small>
         </span>
       </td>`
    : '';

  return `
    <tr class="is-clickable ${emergency.is_sos ? 'is-sos' : ''}"
        data-id="${emergency.id}" tabindex="0">
      <td class="table__col-code">${escapeHtml(emergency.code)}</td>
      <td>
        <div class="type-tag">
          <span class="type-tag__icon" aria-hidden="true">${emergency.type_icon || '⚠'}</span>
          <span class="cell-stack">
            <strong class="cell-truncate">${escapeHtml(emergency.title)}</strong>
            <small>${escapeHtml(emergency.type_name)} · ${escapeHtml(emergency.zone_name || 'Sin zona')}</small>
          </span>
        </div>
      </td>
      ${citizenCell}
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
      <td class="table__col-narrow">${assigned}</td>
      <td class="table__col-narrow cell-time" title="${escapeHtml(formatDateTime(emergency.reported_at))}">
        ${escapeHtml(timeAgo(emergency.reported_at))}
      </td>
    </tr>`;
}

/* ==========================================================================
   Paginacion
   ========================================================================== */

function renderPagination(meta) {
  const info = $('#page-info');
  const controls = $('#page-controls');

  if (!meta || meta.total === 0) {
    info.textContent = 'Sin resultados';
    controls.innerHTML = '';
    return;
  }

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  info.textContent = `Mostrando ${from}–${to} de ${meta.total} emergencia(s)`;

  /*
   * Ventana de paginas alrededor de la actual: con 40 paginas no tiene sentido
   * pintar 40 botones. Se muestran como maximo 5 mas los extremos.
   */
  const pages = [];
  const windowSize = 2;
  const start = Math.max(1, meta.page - windowSize);
  const end = Math.min(meta.totalPages, meta.page + windowSize);

  if (start > 1) pages.push(1);
  if (start > 2) pages.push('…');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < meta.totalPages - 1) pages.push('…');
  if (end < meta.totalPages) pages.push(meta.totalPages);

  const buttons = pages.map((page) => {
    if (page === '…') return '<span class="pagination__page" aria-hidden="true" style="border:none;background:none;">…</span>';
    return `<button type="button" class="pagination__page ${page === meta.page ? 'is-active' : ''}"
              data-page="${page}" ${page === meta.page ? 'aria-current="page"' : ''}>${page}</button>`;
  });

  controls.innerHTML = `
    <button type="button" class="pagination__page" data-page="${meta.page - 1}"
            ${meta.hasPreviousPage ? '' : 'disabled'} aria-label="Pagina anterior">‹</button>
    ${buttons.join('')}
    <button type="button" class="pagination__page" data-page="${meta.page + 1}"
            ${meta.hasNextPage ? '' : 'disabled'} aria-label="Pagina siguiente">›</button>`;
}

/* ==========================================================================
   Carga
   ========================================================================== */

/** Parametros de consulta que entiende el backend. */
function buildParams() {
  const params = {
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    order: state.order,
  };

  Object.entries(state.filters).forEach(([key, value]) => {
    if (value !== '' && value !== null) params[key] = value;
  });

  return params;
}

/** Cuenta los filtros activos, para avisar de que la lista esta recortada. */
function updateFilterCount() {
  const active = Object.values(state.filters).filter((value) => value !== '').length;
  const badge = $('#filters-count');

  badge.hidden = active === 0;
  badge.textContent = active === 1 ? '1 filtro activo' : `${active} filtros activos`;
}

async function load() {
  const body = $('#table-body');
  body.innerHTML = tableLoading(columnCount, 'Cargando emergencias…');

  updateFilterCount();

  try {
    const result = await api.get(state.endpoint, buildParams());
    const items = result.items || [];
    const meta = result.meta;

    state.total = meta ? meta.total : items.length;

    if (items.length === 0) {
      const hasFilters = Object.values(state.filters).some((value) => value !== '');
      body.innerHTML = tableMessage(columnCount, {
        icon: hasFilters ? '🔍' : '📭',
        title: hasFilters ? 'Ningun resultado con esos filtros' : 'No hay emergencias registradas',
        description: hasFilters ? 'Prueba a quitar algun filtro.' : '',
      });
    } else {
      body.innerHTML = items.map(row).join('');
    }

    renderPagination(meta);
    setSubtitle(`${state.total} emergencia(s)`);

    // La URL refleja los filtros: se puede compartir o recargar sin perderlos.
    const query = buildQuery(buildParams());
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  } catch (error) {
    body.innerHTML = tableMessage(columnCount, {
      icon: '⚠',
      title: 'No se pudieron cargar las emergencias',
      description: error.message,
      variant: 'error',
    });
    renderPagination(null);
  }
}

/** Recarga volviendo a la primera pagina (al cambiar un filtro). */
function reload() {
  state.page = 1;
  load();
}

/* ==========================================================================
   Interaccion
   ========================================================================== */

function setupFilters() {
  // La busqueda espera a que el usuario deje de escribir.
  $('#f-search').addEventListener('input', debounce((event) => {
    state.filters.search = event.target.value.trim();
    reload();
  }, 400));

  [
    ['#f-status', 'status'],
    ['#f-type', 'type'],
    ['#f-priority', 'priority'],
    ['#f-zone', 'zone'],
    ['#f-sos', 'sos'],
  ].forEach(([selector, key]) => {
    const node = $(selector);
    if (!node) return;
    node.addEventListener('change', (event) => {
      state.filters[key] = event.target.value;
      reload();
    });
  });

  $('#btn-clear').addEventListener('click', () => {
    Object.keys(state.filters).forEach((key) => { state.filters[key] = ''; });
    $('#f-search').value = '';
    $$('#filters select').forEach((select) => { select.value = ''; });
    reload();
  });

  $('#btn-refresh').addEventListener('click', () => load());
}

function setupSorting() {
  $$('.table__sort').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;

      // Pulsar la columna ya activa invierte el orden.
      if (state.sort === key) {
        state.order = state.order === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = key;
        state.order = 'desc';
      }

      $$('.table__sort').forEach((other) => {
        other.classList.toggle('is-sorted', other === button);
        const icon = other.querySelector('.table__sort-icon');
        if (other === button) icon.textContent = state.order === 'asc' ? '↑' : '↓';
        else icon.textContent = '↕';
      });

      reload();
    });
  });
}

function setupPagination() {
  $('#page-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;

    const page = Number.parseInt(button.dataset.page, 10);
    if (Number.isNaN(page) || page < 1) return;

    state.page = page;
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function setupRowNavigation() {
  const body = $('#table-body');

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

/**
 * Tiempo real: se recarga la pagina de datos cuando algo cambia.
 * Se recarga en vez de insertar la fila a mano porque el orden y los filtros
 * los decide el servidor: insertarla en el sitio equivocado seria peor que
 * volver a pedir la lista.
 */
function setupRealtime() {
  const refresh = debounce(() => load(), 600);

  [
    SOCKET_EVENTS.EMERGENCY_NEW,
    SOCKET_EVENTS.EMERGENCY_STATUS,
    SOCKET_EVENTS.EMERGENCY_ASSIGNED,
    SOCKET_EVENTS.EMERGENCY_UPDATE,
  ].forEach((event) => realtime.on(event, refresh));
}

/** Lee los filtros de la URL, para que recargar mantenga la vista. */
function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);

  Object.keys(state.filters).forEach((key) => {
    const value = params.get(key);
    if (value === null) return;

    state.filters[key] = value;
    const input = $(`#f-${key}`);
    if (input) input.value = value;
  });

  const page = Number.parseInt(params.get('page'), 10);
  if (!Number.isNaN(page) && page > 0) state.page = page;

  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('order')) state.order = params.get('order');
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth();
  if (!user) return;

  state.isControlRoom = session.isControlRoom();

  // Cada rol consulta su propio endpoint.
  if (session.isResponder()) state.endpoint = '/emergencies/assigned';
  else if (session.isCitizen()) state.endpoint = '/emergencies/mine';

  const titles = {
    [ROLES.ADMINISTRADOR]: 'Todas las emergencias',
    [ROLES.OPERADOR]: 'Todas las emergencias',
    [ROLES.PERSONAL]: 'Mis emergencias asignadas',
    [ROLES.CIUDADANO]: 'Mis reportes',
  };

  await mountLayout({ user, title: titles[user.role_code] || 'Emergencias' });

  // Se ocultan los filtros y columnas que no corresponden al rol.
  if (!state.isControlRoom) {
    $$('[data-control-room]').forEach((node) => node.remove());
    columnCount = 6;
  }

  $('#list-subtitle').textContent = state.isControlRoom
    ? 'Busca, filtra y abre cualquier emergencia del sistema'
    : titles[user.role_code];

  setupFilters();
  setupSorting();
  setupPagination();
  setupRowNavigation();
  setupRealtime();

  readFiltersFromUrl();
  await loadCatalogs();

  // Los catalogos se cargan despues de leer la URL: hay que reponer el valor.
  Object.entries(state.filters).forEach(([key, value]) => {
    const input = $(`#f-${key}`);
    if (input && value) input.value = value;
  });

  await load();
}

init();
