/**
 * users.js - Gestion de usuarios (solo administrador).
 *
 * El backend impide desactivar o borrar al ultimo administrador y a uno mismo.
 * Aqui no se replica esa logica: se muestran los botones y, si el servidor lo
 * rechaza, se muestra su explicacion. Duplicar la regla en el cliente solo
 * conseguiria que un dia las dos versiones dejaran de coincidir.
 */

import { ROLES } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import {
  notify, notifyApiError, confirmDialog, formModal, tableLoading, tableMessage, busyButton,
} from '../core/ui.js';
import { $, $$, escapeHtml, formatDateTime, timeAgo, debounce, initials } from '../core/utils.js';

const COLUMNS = 6;

const state = {
  page: 1,
  limit: 20,
  search: '',
  role: '',
  active: '',
};

/** Roles disponibles, para los <select> de los formularios. */
let roleCatalog = [];

/* ==========================================================================
   Formulario de usuario
   ========================================================================== */

/** Campos comunes de alta y edicion. */
function userFormHtml(user = null) {
  const isNew = user === null;

  const roleOptions = roleCatalog
    .map((role) => `
      <option value="${role.code}" ${user && user.role_code === role.code ? 'selected' : ''}>
        ${escapeHtml(role.name)}
      </option>`)
    .join('');

  return `
    <div class="form__row">
      <div class="field">
        <label class="field__label" for="firstName">Nombre <span class="required">*</span></label>
        <input class="input" id="firstName" name="firstName" required
               value="${escapeHtml(user?.first_name || '')}">
      </div>
      <div class="field">
        <label class="field__label" for="lastName">Apellido <span class="required">*</span></label>
        <input class="input" id="lastName" name="lastName" required
               value="${escapeHtml(user?.last_name || '')}">
      </div>
    </div>

    <div class="form__row">
      <div class="field">
        <label class="field__label" for="documentType">Tipo de documento</label>
        <select class="select" id="documentType" name="documentType">
          ${['CC', 'TI', 'CE', 'PA'].map((type) => `
            <option value="${type}" ${user?.document_type === type ? 'selected' : ''}>${type}</option>
          `).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="documentNumber">Numero de documento <span class="required">*</span></label>
        <input class="input" id="documentNumber" name="documentNumber" required
               value="${escapeHtml(user?.document_number || '')}">
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="email">Correo electronico <span class="required">*</span></label>
      <input class="input" type="email" id="email" name="email" required
             value="${escapeHtml(user?.email || '')}">
    </div>

    <div class="form__row">
      <div class="field">
        <label class="field__label" for="phone">Telefono</label>
        <input class="input" id="phone" name="phone" value="${escapeHtml(user?.phone || '')}">
      </div>
      <div class="field">
        <label class="field__label" for="role">Rol <span class="required">*</span></label>
        <select class="select" id="role" name="role" required>${roleOptions}</select>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="address">Direccion</label>
      <input class="input" id="address" name="address" value="${escapeHtml(user?.address || '')}">
    </div>

    ${isNew ? `
      <div class="field">
        <label class="field__label" for="password">Contrasena <span class="required">*</span></label>
        <input class="input" type="password" id="password" name="password" required
               autocomplete="new-password">
        <p class="field__hint">
          Minimo 8 caracteres, con mayuscula, minuscula y numero.
        </p>
      </div>` : ''}`;
}

/** Alta de usuario. */
async function createUser() {
  const data = await formModal({
    title: 'Nuevo usuario',
    submitLabel: 'Crear usuario',
    size: 'md',
    formHtml: userFormHtml(),
    onSubmit: async (values) => {
      await api.post('/users', values);
    },
  });

  if (data) {
    notify.success(`Usuario ${data.email} creado`);
    await load();
  }
}

/** Edicion de usuario. */
async function editUser(id) {
  let user;

  try {
    user = await api.get(`/users/${id}`);
  } catch (error) {
    return notifyApiError(error, 'No se pudo cargar el usuario');
  }

  const data = await formModal({
    title: `Editar ${user.full_name}`,
    submitLabel: 'Guardar cambios',
    size: 'md',
    formHtml: userFormHtml(user),
    onSubmit: async (values) => {
      await api.put(`/users/${id}`, values);
    },
  });

  if (data) {
    notify.success('Usuario actualizado');
    await load();
  }

  return undefined;
}

/** Activa o desactiva la cuenta. */
async function toggleActive(id, user) {
  const activating = !user.is_active;

  const confirmed = await confirmDialog({
    title: activating ? 'Activar usuario' : 'Desactivar usuario',
    message: activating
      ? `${user.full_name} podra volver a iniciar sesion.`
      : `${user.full_name} no podra iniciar sesion y se cerraran sus sesiones abiertas.`,
    confirmLabel: activating ? 'Activar' : 'Desactivar',
    variant: activating ? 'primary' : 'danger',
  });

  if (!confirmed) return;

  try {
    await api.patch(`/users/${id}/status`, { isActive: activating });
    notify.success(activating ? 'Usuario activado' : 'Usuario desactivado');
    await load();
  } catch (error) {
    notifyApiError(error, 'No se pudo cambiar el estado');
  }
}

/** Elimina el usuario. El backend lo impide si tiene historial. */
async function removeUser(id, user) {
  const confirmed = await confirmDialog({
    title: 'Eliminar usuario',
    message: `Se eliminara la cuenta de ${user.full_name}. Si tiene emergencias reportadas, ` +
             'el sistema lo impedira para no perder el historial.',
    confirmLabel: 'Eliminar',
    variant: 'danger',
  });

  if (!confirmed) return;

  try {
    await api.delete(`/users/${id}`);
    notify.success('Usuario eliminado');
    await load();
  } catch (error) {
    notifyApiError(error, 'No se pudo eliminar el usuario');
  }
}

/* ==========================================================================
   Tabla
   ========================================================================== */

const ROLE_BADGE = {
  ADMINISTRADOR: 'badge--danger',
  OPERADOR: 'badge--info',
  PERSONAL: 'badge--warning',
  CIUDADANO: 'badge--neutral',
};

function row(user) {
  return `
    <tr data-id="${user.id}">
      <td>
        <div class="cell-user">
          <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(user.full_name))}</span>
          <span class="cell-stack">
            <strong>${escapeHtml(user.full_name)}</strong>
            <small>${escapeHtml(user.email)}</small>
          </span>
        </div>
      </td>
      <td><span class="cell-stack">
        <strong>${escapeHtml(user.document_number)}</strong>
        <small>${escapeHtml(user.document_type)}</small>
      </span></td>
      <td class="table__col-narrow">
        <span class="badge ${ROLE_BADGE[user.role_code] || 'badge--neutral'}">
          ${escapeHtml(user.role_name)}
        </span>
      </td>
      <td class="table__col-narrow">
        <span class="badge ${user.is_active ? 'badge--success' : 'badge--neutral'}">
          ${user.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td class="table__col-narrow cell-time"
          title="${user.last_login_at ? escapeHtml(formatDateTime(user.last_login_at)) : ''}">
        ${user.last_login_at ? escapeHtml(timeAgo(user.last_login_at)) : 'Nunca'}
      </td>
      <td class="table__col-actions">
        <button type="button" class="btn-icon" data-do="edit" title="Editar" aria-label="Editar">✎</button>
        <button type="button" class="btn-icon" data-do="toggle"
                title="${user.is_active ? 'Desactivar' : 'Activar'}"
                aria-label="${user.is_active ? 'Desactivar' : 'Activar'}">${user.is_active ? '⏸' : '▶'}</button>
        <button type="button" class="btn-icon" data-do="delete" title="Eliminar" aria-label="Eliminar">🗑</button>
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
  info.textContent = `Mostrando ${from}–${to} de ${meta.total} usuario(s)`;

  controls.innerHTML = `
    <button type="button" class="pagination__page" data-page="${meta.page - 1}"
            ${meta.hasPreviousPage ? '' : 'disabled'} aria-label="Anterior">‹</button>
    <span class="pagination__info">Pagina ${meta.page} de ${meta.totalPages}</span>
    <button type="button" class="pagination__page" data-page="${meta.page + 1}"
            ${meta.hasNextPage ? '' : 'disabled'} aria-label="Siguiente">›</button>`;
}

/** Usuarios de la pagina actual, para no volver a pedirlos al pulsar accion. */
let currentUsers = [];

async function load() {
  const body = $('#table-body');
  body.innerHTML = tableLoading(COLUMNS, 'Cargando usuarios…');

  const params = { page: state.page, limit: state.limit };
  if (state.search) params.search = state.search;
  if (state.role) params.role = state.role;
  if (state.active) params.active = state.active;

  try {
    const result = await api.get('/users', params);
    currentUsers = result.items || [];

    if (currentUsers.length === 0) {
      body.innerHTML = tableMessage(COLUMNS, {
        icon: '🔍',
        title: 'Ningun usuario coincide con la busqueda',
      });
    } else {
      body.innerHTML = currentUsers.map(row).join('');
    }

    renderPagination(result.meta);
    setSubtitle(`${result.meta ? result.meta.total : currentUsers.length} usuario(s)`);
  } catch (error) {
    body.innerHTML = tableMessage(COLUMNS, {
      icon: '⚠',
      title: 'No se pudieron cargar los usuarios',
      description: error.message,
      variant: 'error',
    });
  }
}

/* ==========================================================================
   Interaccion
   ========================================================================== */

function setupFilters() {
  $('#f-search').addEventListener('input', debounce((event) => {
    state.search = event.target.value.trim();
    state.page = 1;
    load();
  }, 400));

  $('#f-role').addEventListener('change', (event) => {
    state.role = event.target.value;
    state.page = 1;
    load();
  });

  $('#f-active').addEventListener('change', (event) => {
    state.active = event.target.value;
    state.page = 1;
    load();
  });

  $('#btn-clear').addEventListener('click', () => {
    state.search = '';
    state.role = '';
    state.active = '';
    state.page = 1;
    $('#f-search').value = '';
    $('#f-role').value = '';
    $('#f-active').value = '';
    load();
  });
}

/**
 * Descarga la hoja de accesos.
 * El servidor la regenera en cada creacion de usuario, asi que lo que se baja
 * siempre esta al dia.
 */
async function downloadCredentials(button) {
  const done = busyButton(button, 'Generando…');

  try {
    await api.download('/users/credentials.xlsx', 'usuarios-y-contrasenas.xlsx');
    notify.success('Hoja de accesos descargada');
  } catch (error) {
    notifyApiError(error, 'No se pudo generar la hoja de accesos');
  } finally {
    done();
  }
}

function setupActions() {
  $('#btn-new').addEventListener('click', createUser);

  $('#btn-credentials').addEventListener('click', (event) => {
    downloadCredentials(event.currentTarget);
  });

  $('#table-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-do]');
    if (!button) return;

    const id = Number.parseInt(button.closest('tr').dataset.id, 10);
    const user = currentUsers.find((item) => item.id === id);
    if (!user) return;

    switch (button.dataset.do) {
      case 'edit':
        return editUser(id);
      case 'toggle':
        return toggleActive(id, user);
      case 'delete':
        return removeUser(id, user);
      default:
        return undefined;
    }
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

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth([ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Gestion de usuarios' });

  try {
    roleCatalog = await api.get('/catalogs/roles');
    roleCatalog.forEach((role) => {
      const option = document.createElement('option');
      option.value = role.code;
      option.textContent = role.name;
      $('#f-role').appendChild(option);
    });
  } catch {
    notify.warning('No se pudo cargar el catalogo de roles');
  }

  setupFilters();
  setupActions();
  await load();
}

init();
