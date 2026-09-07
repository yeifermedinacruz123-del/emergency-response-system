/**
 * audit.js - Bitacora de auditoria (solo administrador).
 *
 * La tabla `audit_logs` es de solo lectura por diseno: aqui no hay botones de
 * editar ni de borrar. Una bitacora que se puede modificar no sirve como
 * bitacora, y el backend tampoco expone endpoints para ello.
 *
 * Lo que se registra viene de `auditModel.record()`, que llaman los servicios
 * en cada operacion sensible: entradas al sistema, altas y bajas de usuarios,
 * cambios de rol, cambios de estado de una emergencia y asignaciones.
 */

import { ROLES } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { notify, tableLoading, tableMessage } from '../core/ui.js';
import { $, escapeHtml, formatDateTime, timeAgo, truncate } from '../core/utils.js';

const COLUMNS = 5;

const state = {
  page: 1,
  limit: 20,
  action: '',
  entity: '',
  from: '',
  to: '',
};

/**
 * Color de cada accion. Las de riesgo (borrar, cambiar rol, login fallido)
 * llevan rojo para que salten a la vista al recorrer la lista.
 */
const ACTION_BADGE = {
  LOGIN: 'badge--success',
  LOGIN_FALLIDO: 'badge--danger',
  LOGOUT: 'badge--neutral',
  CREAR: 'badge--info',
  ACTUALIZAR: 'badge--neutral',
  ELIMINAR: 'badge--danger',
  CAMBIO_ESTADO: 'badge--warning',
  CAMBIO_ROL: 'badge--danger',
  ASIGNAR: 'badge--info',
};

/** Nombre legible de cada accion y de cada entidad. */
const ACTION_LABEL = {
  LOGIN: 'Entrada',
  LOGIN_FALLIDO: 'Entrada fallida',
  LOGOUT: 'Salida',
  CREAR: 'Creacion',
  ACTUALIZAR: 'Actualizacion',
  ELIMINAR: 'Eliminacion',
  CAMBIO_ESTADO: 'Cambio de estado',
  CAMBIO_ROL: 'Cambio de rol',
  ASIGNAR: 'Asignacion',
};

const ENTITY_LABEL = {
  users: 'Usuarios',
  emergencies: 'Emergencias',
  responders: 'Personal',
  assignments: 'Asignaciones',
  system_settings: 'Configuracion',
};

/* ==========================================================================
   Tabla
   ========================================================================== */

function row(entry) {
  const entity = ENTITY_LABEL[entry.entity] || entry.entity || '—';

  return `
    <tr>
      <td class="table__col-narrow cell-time"
          title="${escapeHtml(formatDateTime(entry.created_at))}">
        <span class="cell-stack">
          <strong>${escapeHtml(timeAgo(entry.created_at))}</strong>
          <small>${escapeHtml(formatDateTime(entry.created_at))}</small>
        </span>
      </td>

      <td>
        <span class="cell-stack">
          <strong>${escapeHtml(entry.user_name || 'Sistema')}</strong>
          <small>${escapeHtml(entry.user_role || 'automatico')}</small>
        </span>
      </td>

      <td class="table__col-narrow">
        <span class="badge ${ACTION_BADGE[entry.action] || 'badge--neutral'}">
          ${escapeHtml(ACTION_LABEL[entry.action] || entry.action)}
        </span>
      </td>

      <td>
        <span class="cell-stack">
          <span>${escapeHtml(entry.description || '—')}</span>
          <small>${escapeHtml(entity)}${entry.entity_id ? ` · #${entry.entity_id}` : ''}</small>
        </span>
      </td>

      <td class="table__col-narrow">
        <small class="text-muted">${escapeHtml(truncate(entry.ip_address || '—', 24))}</small>
      </td>
    </tr>`;
}

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
  info.textContent = `Mostrando ${from}–${to} de ${meta.total} registro(s)`;

  controls.innerHTML = `
    <button type="button" class="pagination__page" data-page="${meta.page - 1}"
            ${meta.hasPreviousPage ? '' : 'disabled'} aria-label="Anterior">‹</button>
    <span class="pagination__info">Pagina ${meta.page} de ${meta.totalPages}</span>
    <button type="button" class="pagination__page" data-page="${meta.page + 1}"
            ${meta.hasNextPage ? '' : 'disabled'} aria-label="Siguiente">›</button>`;
}

async function load() {
  const body = $('#table-body');
  body.innerHTML = tableLoading(COLUMNS, 'Cargando la bitacora…');

  const params = { page: state.page, limit: state.limit };
  if (state.action) params.action = state.action;
  if (state.entity) params.entity = state.entity;
  if (state.from) params.from = state.from;
  // "Hasta" incluye el dia entero: sin la hora, el filtro dejaria fuera todo
  // lo ocurrido despues de la medianoche de esa fecha.
  if (state.to) params.to = `${state.to} 23:59:59`;

  try {
    const result = await api.get('/audit', params);
    const items = result.items || [];

    if (items.length === 0) {
      body.innerHTML = tableMessage(COLUMNS, {
        icon: '🗂️',
        title: 'Ningun registro coincide con los filtros',
        description: 'Prueba a ampliar el rango de fechas.',
      });
    } else {
      body.innerHTML = items.map(row).join('');
    }

    renderPagination(result.meta);
    setSubtitle(`${result.meta ? result.meta.total : items.length} registro(s)`);
  } catch (error) {
    body.innerHTML = tableMessage(COLUMNS, {
      icon: '⚠',
      title: 'No se pudo cargar la bitacora',
      description: error.message,
      variant: 'error',
    });
    renderPagination(null);
  }
}

/* ==========================================================================
   Interaccion
   ========================================================================== */

function setupFilters() {
  const apply = (key) => (event) => {
    state[key] = event.target.value;
    state.page = 1;
    load();
  };

  $('#f-action').addEventListener('change', apply('action'));
  $('#f-entity').addEventListener('change', apply('entity'));
  $('#f-from').addEventListener('change', apply('from'));
  $('#f-to').addEventListener('change', apply('to'));

  $('#btn-clear').addEventListener('click', () => {
    Object.assign(state, { action: '', entity: '', from: '', to: '', page: 1 });
    ['#f-action', '#f-entity', '#f-from', '#f-to'].forEach((selector) => {
      $(selector).value = '';
    });
    load();
  });

  $('#btn-refresh').addEventListener('click', () => load());

  $('#page-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;

    const page = Number.parseInt(button.dataset.page, 10);
    if (Number.isNaN(page) || page < 1) return;

    state.page = page;
    load();
  });
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth([ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Auditoria del sistema' });

  // Las acciones posibles las dicta el backend, no una lista escrita aqui:
  // si manana se anade una accion nueva, el filtro la recoge solo.
  try {
    const actions = await api.get('/audit/actions');
    const select = $('#f-action');

    actions.forEach((action) => {
      const option = document.createElement('option');
      option.value = action;
      option.textContent = ACTION_LABEL[action] || action;
      select.appendChild(option);
    });
  } catch {
    notify.warning('No se pudo cargar la lista de acciones');
  }

  setupFilters();
  await load();
}

init();
