/**
 * responders.js - Gestion del personal de emergencia.
 *
 * El operador consulta y cambia la disponibilidad; el administrador ademas
 * crea y edita las fichas. La posicion de cada unidad se actualiza en vivo por
 * Socket.IO, sin recargar la tabla entera.
 */

import { ROLES, RESPONDER_META, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth, session } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import {
  notify, notifyApiError, formModal, tableLoading, tableMessage,
} from '../core/ui.js';
import {
  $, escapeHtml, formatCoords, timeAgo, formatDateTime, debounce, initials,
} from '../core/utils.js';

const COLUMNS = 7;

const state = { page: 1, limit: 20, search: '', type: '', status: '' };

let currentUnits = [];
let isAdmin = false;

const TYPE_ICONS = {
  PARAMEDICO: '🚑',
  BOMBERO: '🚒',
  POLICIA: '🚓',
  RESCATISTA: '🧗',
};

/* ==========================================================================
   Tabla
   ========================================================================== */

function row(unit) {
  const position = unit.current_latitude
    ? `<span class="cell-stack">
         <strong class="data-pair__value--mono">${formatCoords(unit.current_latitude, unit.current_longitude, 4)}</strong>
         <small>${escapeHtml(timeAgo(unit.location_updated_at))}</small>
       </span>`
    : '<span class="text-subtle" style="font-size: var(--text-xs);">Sin posicion</span>';

  const load = unit.active_assignments > 0
    ? `<span class="badge badge--info">${unit.active_assignments} activa(s)</span>`
    : '<span class="text-subtle" style="font-size: var(--text-xs);">Libre</span>';

  return `
    <tr data-id="${unit.id}" ${unit.is_active ? '' : 'style="opacity:.55"'}>
      <td class="table__col-narrow">
        <div class="type-tag">
          <span class="type-tag__icon" aria-hidden="true">${TYPE_ICONS[unit.responder_type] || '🚨'}</span>
          <strong class="data-pair__value--mono">${escapeHtml(unit.unit_code)}</strong>
        </div>
      </td>
      <td>
        <div class="cell-user">
          <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(unit.full_name))}</span>
          <span class="cell-stack">
            <strong>${escapeHtml(unit.full_name)}</strong>
            <small>${escapeHtml(unit.institution || unit.unit_name || '')}</small>
          </span>
        </div>
      </td>
      <td class="table__col-narrow">
        ${escapeHtml(RESPONDER_META.types[unit.responder_type]?.label || unit.responder_type)}
      </td>
      <td class="table__col-narrow">
        <span class="badge badge--responder" data-status="${unit.status}" data-unit-status>
          ${escapeHtml(RESPONDER_META.statuses[unit.status]?.label || unit.status)}
        </span>
      </td>
      <td class="table__col-narrow">${load}</td>
      <td data-unit-position>${position}</td>
      <td class="table__col-actions">
        <button type="button" class="btn-icon" data-do="status"
                title="Cambiar disponibilidad" aria-label="Cambiar disponibilidad">⇄</button>
        ${isAdmin
          ? '<button type="button" class="btn-icon" data-do="edit" title="Editar" aria-label="Editar">✎</button>'
          : ''}
      </td>
    </tr>`;
}

function renderSummary(units) {
  const counts = { DISPONIBLE: 0, OCUPADO: 0, FUERA_DE_SERVICIO: 0 };
  units.forEach((unit) => {
    if (counts[unit.status] !== undefined) counts[unit.status] += 1;
  });

  Object.entries(counts).forEach(([status, count]) => {
    const node = document.querySelector(`[data-count="${status}"]`);
    if (node) node.textContent = count;
  });
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
  info.textContent = `Mostrando ${from}–${to} de ${meta.total} unidad(es)`;

  controls.innerHTML = `
    <button type="button" class="pagination__page" data-page="${meta.page - 1}"
            ${meta.hasPreviousPage ? '' : 'disabled'} aria-label="Anterior">‹</button>
    <span class="pagination__info">Pagina ${meta.page} de ${meta.totalPages}</span>
    <button type="button" class="pagination__page" data-page="${meta.page + 1}"
            ${meta.hasNextPage ? '' : 'disabled'} aria-label="Siguiente">›</button>`;
}

async function load() {
  const body = $('#table-body');
  body.innerHTML = tableLoading(COLUMNS, 'Cargando personal…');

  const params = { page: state.page, limit: state.limit };
  if (state.search) params.search = state.search;
  if (state.type) params.type = state.type;
  if (state.status) params.status = state.status;

  try {
    const result = await api.get('/responders', params);
    currentUnits = result.items || [];

    if (currentUnits.length === 0) {
      body.innerHTML = tableMessage(COLUMNS, {
        icon: '🔍',
        title: 'Ninguna unidad coincide con la busqueda',
      });
    } else {
      body.innerHTML = currentUnits.map(row).join('');
    }

    renderPagination(result.meta);
    renderSummary(currentUnits);
    setSubtitle(`${result.meta ? result.meta.total : currentUnits.length} unidad(es)`);
  } catch (error) {
    body.innerHTML = tableMessage(COLUMNS, {
      icon: '⚠',
      title: 'No se pudo cargar el personal',
      description: error.message,
      variant: 'error',
    });
  }
}

/* ==========================================================================
   Acciones
   ========================================================================== */

/** Cambia la disponibilidad de una unidad. */
async function changeStatus(unit) {
  const options = Object.entries(RESPONDER_META.statuses)
    .map(([code, meta]) => `
      <label class="unit-option">
        <input type="radio" name="status" value="${code}" ${unit.status === code ? 'checked' : ''}>
        <span class="unit-option__body"><strong>${escapeHtml(meta.label)}</strong></span>
      </label>`)
    .join('');

  const data = await formModal({
    title: `Disponibilidad de ${unit.unit_code}`,
    submitLabel: 'Guardar',
    size: 'sm',
    formHtml: `
      <p class="text-muted" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
        Una unidad con una emergencia sin cerrar no puede quedar libre:
        primero hay que retirarla o cerrar el caso.
      </p>
      <div class="unit-picker">${options}</div>`,
    onSubmit: async (values) => {
      if (!values.status) {
        throw { errors: [{ field: 'status', message: 'Selecciona una disponibilidad' }] };
      }
      await api.patch(`/responders/${unit.id}/status`, { status: values.status });
    },
  });

  if (data) {
    notify.success('Disponibilidad actualizada');
    await load();
  }
}

/** Formulario de la ficha (solo administrador). */
function unitFormHtml(unit = null) {
  const typeOptions = Object.entries(RESPONDER_META.types)
    .map(([code, meta]) => `
      <option value="${code}" ${unit?.responder_type === code ? 'selected' : ''}>
        ${escapeHtml(meta.label)}
      </option>`)
    .join('');

  return `
    <div class="form__row">
      <div class="field">
        <label class="field__label" for="unitCode">Codigo de unidad <span class="required">*</span></label>
        <input class="input" id="unitCode" name="unitCode" required
               placeholder="UM-04" value="${escapeHtml(unit?.unit_code || '')}">
        <p class="field__hint">Letras, numeros y guiones.</p>
      </div>
      <div class="field">
        <label class="field__label" for="responderType">Tipo <span class="required">*</span></label>
        <select class="select" id="responderType" name="responderType" required>${typeOptions}</select>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="unitName">Nombre de la unidad</label>
      <input class="input" id="unitName" name="unitName"
             placeholder="Unidad Medica 04" value="${escapeHtml(unit?.unit_name || '')}">
    </div>

    <div class="field">
      <label class="field__label" for="institution">Institucion</label>
      <input class="input" id="institution" name="institution"
             value="${escapeHtml(unit?.institution || '')}">
    </div>`;
}

/** Edita la ficha de una unidad. */
async function editUnit(unit) {
  const data = await formModal({
    title: `Editar ${unit.unit_code}`,
    submitLabel: 'Guardar cambios',
    formHtml: unitFormHtml(unit),
    onSubmit: async (values) => {
      await api.put(`/responders/${unit.id}`, values);
    },
  });

  if (data) {
    notify.success('Unidad actualizada');
    await load();
  }
}

/**
 * Crea una ficha nueva.
 * Antes hay que elegir el usuario: una unidad siempre pertenece a alguien con
 * rol PERSONAL, y solo se ofrecen los que aun no tienen ficha.
 */
async function createUnit() {
  let candidates = [];

  try {
    const result = await api.get('/users', { role: ROLES.PERSONAL, active: 'true', limit: 100 });
    const users = result.items || [];

    const existing = await api.get('/responders', { limit: 100 });
    const taken = new Set((existing.items || []).map((unit) => unit.user_id));

    candidates = users.filter((user) => !taken.has(user.id));
  } catch (error) {
    return notifyApiError(error, 'No se pudieron cargar los usuarios disponibles');
  }

  if (candidates.length === 0) {
    notify.warning(
      'No hay usuarios con rol PERSONAL sin ficha. Crea primero el usuario en la pagina de Usuarios.'
    );
    return undefined;
  }

  const userOptions = candidates
    .map((user) => `<option value="${user.id}">${escapeHtml(user.full_name)} · ${escapeHtml(user.email)}</option>`)
    .join('');

  const data = await formModal({
    title: 'Nueva unidad',
    submitLabel: 'Crear unidad',
    formHtml: `
      <div class="field">
        <label class="field__label" for="userId">Usuario responsable <span class="required">*</span></label>
        <select class="select" id="userId" name="userId" required>${userOptions}</select>
        <p class="field__hint">Solo aparecen usuarios con rol PERSONAL que aun no tienen unidad.</p>
      </div>
      ${unitFormHtml()}`,
    onSubmit: async (values) => {
      await api.post('/responders', values);
    },
  });

  if (data) {
    notify.success('Unidad creada');
    await load();
  }

  return undefined;
}

/* ==========================================================================
   Interaccion y tiempo real
   ========================================================================== */

function setupFilters() {
  $('#f-search').addEventListener('input', debounce((event) => {
    state.search = event.target.value.trim();
    state.page = 1;
    load();
  }, 400));

  ['#f-type', '#f-status'].forEach((selector) => {
    $(selector).addEventListener('change', (event) => {
      state[selector === '#f-type' ? 'type' : 'status'] = event.target.value;
      state.page = 1;
      load();
    });
  });

  $('#btn-clear').addEventListener('click', () => {
    state.search = '';
    state.type = '';
    state.status = '';
    state.page = 1;
    $('#f-search').value = '';
    $('#f-type').value = '';
    $('#f-status').value = '';
    load();
  });
}

function setupActions() {
  if (isAdmin) {
    const button = $('#btn-new');
    button.hidden = false;
    button.addEventListener('click', createUnit);
  }

  $('#table-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-do]');
    if (!button) return;

    const id = Number.parseInt(button.closest('tr').dataset.id, 10);
    const unit = currentUnits.find((item) => item.id === id);
    if (!unit) return;

    if (button.dataset.do === 'status') changeStatus(unit);
    if (button.dataset.do === 'edit') editUnit(unit);
  });

  $('#page-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;

    const page = Number.parseInt(button.dataset.page, 10);
    if (Number.isNaN(page) || page < 1) return;

    state.page = page;
    load();
  });
}

function setupRealtime() {
  // La posicion cambia cada pocos segundos: se actualiza solo esa celda.
  realtime.on(SOCKET_EVENTS.RESPONDER_LOCATION_UPDATE, (unit) => {
    const row = document.querySelector(`tr[data-id="${unit.id}"]`);
    if (!row) return;

    const cell = row.querySelector('[data-unit-position]');
    if (!cell) return;

    cell.innerHTML = `
      <span class="cell-stack">
        <strong class="data-pair__value--mono">${formatCoords(unit.current_latitude, unit.current_longitude, 4)}</strong>
        <small>${escapeHtml(timeAgo(unit.location_updated_at))}</small>
      </span>`;
  });

  // Un cambio de disponibilidad si afecta a los contadores: se recarga.
  realtime.on(SOCKET_EVENTS.RESPONDER_STATUS_UPDATE, debounce(() => load(), 500));
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth([ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
  if (!user) return;

  isAdmin = session.isAdmin();

  await mountLayout({ user, title: 'Personal de emergencia' });

  setupFilters();
  setupActions();
  setupRealtime();

  await load();
}

init();
