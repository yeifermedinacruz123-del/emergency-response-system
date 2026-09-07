/**
 * settings.js - Configuracion del sistema (solo administrador).
 *
 * Las opciones son un catalogo cerrado: viven en la tabla `system_settings` y
 * el backend solo acepta claves que ya existan. Por eso el formulario se pinta
 * a partir de lo que responde el servidor, en vez de llevar una lista escrita
 * aqui que tarde o temprano dejaria de coincidir.
 *
 * Cada fila sabe su tipo (`dataType`) y se dibuja con el control adecuado:
 * casilla para los booleanos, campo numerico para los numeros y texto para el
 * resto. Solo se envian las claves que el administrador haya tocado.
 */

import { ROLES } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { notify, notifyApiError, busyButton } from '../core/ui.js';
import { $, $$, escapeHtml, formatDateTime } from '../core/utils.js';

/** Valores tal como los devolvio el servidor, para saber que ha cambiado. */
let original = new Map();

/**
 * Agrupacion por prefijo de la clave: "map.zoom" cae en el grupo "map".
 * Solo es presentacion; el backend no sabe nada de grupos.
 */
const GROUP_LABEL = {
  app: 'Aplicacion',
  map: 'Mapa',
  sos: 'Boton SOS',
  emergency: 'Emergencias',
  notifications: 'Notificaciones',
};

/** Opciones cerradas para las claves cuyo valor no es libre. */
const CHOICES = {
  'sos.auto_priority': ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'],
};

/* ==========================================================================
   Formulario
   ========================================================================== */

/** Control de una opcion, segun su tipo. */
function control(setting) {
  const id = `set-${setting.key.replace(/\./g, '-')}`;

  if (setting.dataType === 'boolean') {
    return `
      <label class="checkbox">
        <input type="checkbox" id="${id}" data-key="${escapeHtml(setting.key)}"
               data-type="boolean" ${setting.value ? 'checked' : ''}>
        <span>${setting.value ? 'Activado' : 'Desactivado'}</span>
      </label>`;
  }

  if (CHOICES[setting.key]) {
    const options = CHOICES[setting.key]
      .map((choice) => `
        <option value="${choice}" ${String(setting.value) === choice ? 'selected' : ''}>
          ${choice}
        </option>`)
      .join('');

    return `<select class="select select--sm" id="${id}"
                    data-key="${escapeHtml(setting.key)}" data-type="string">${options}</select>`;
  }

  if (setting.dataType === 'number') {
    return `<input class="input input--sm" type="number" step="any" id="${id}"
                   data-key="${escapeHtml(setting.key)}" data-type="number"
                   value="${escapeHtml(String(setting.value ?? ''))}">`;
  }

  return `<input class="input input--sm" type="text" id="${id}"
                 data-key="${escapeHtml(setting.key)}" data-type="string"
                 value="${escapeHtml(String(setting.value ?? ''))}">`;
}

function settingRow(setting) {
  const id = `set-${setting.key.replace(/\./g, '-')}`;

  return `
    <div class="setting">
      <div class="setting__info">
        <label class="setting__label" for="${id}">
          ${escapeHtml(setting.description || setting.key)}
        </label>
        <code class="setting__key">${escapeHtml(setting.key)}</code>
        ${setting.updatedByName
          ? `<small class="setting__meta">Ultimo cambio: ${escapeHtml(setting.updatedByName)}
               · ${escapeHtml(formatDateTime(setting.updatedAt))}</small>`
          : ''}
      </div>
      <div class="setting__control">${control(setting)}</div>
    </div>`;
}

function render(settings) {
  original = new Map(settings.map((setting) => [setting.key, setting.value]));

  // Agrupadas por el prefijo de la clave, en el orden en que llegan.
  const groups = new Map();
  settings.forEach((setting) => {
    const prefix = setting.key.split('.')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(setting);
  });

  $('#settings-groups').innerHTML = Array.from(groups.entries())
    .map(([prefix, items]) => `
      <fieldset class="setting-group">
        <legend class="setting-group__title">${escapeHtml(GROUP_LABEL[prefix] || prefix)}</legend>
        ${items.map(settingRow).join('')}
      </fieldset>`)
    .join('');

  setSubtitle(`${settings.length} opcion(es)`);
  $('#settings-hint').textContent =
    'Los cambios se guardan en la base de datos y quedan registrados en la auditoria.';
}

/* ==========================================================================
   Cambios
   ========================================================================== */

/** Lee un control y devuelve su valor ya convertido al tipo que toca. */
function readControl(input) {
  if (input.dataset.type === 'boolean') return input.checked;
  if (input.dataset.type === 'number') {
    const parsed = Number(input.value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return input.value.trim();
}

/** Solo las claves que el administrador haya modificado. */
function collectChanges() {
  const changes = {};

  $$('[data-key]').forEach((input) => {
    const key = input.dataset.key;
    const value = readControl(input);
    if (value !== null && value !== original.get(key)) changes[key] = value;
  });

  return changes;
}

/** Activa o desactiva los botones segun haya cambios pendientes. */
function refreshButtons() {
  const dirty = Object.keys(collectChanges()).length > 0;
  $('#btn-save').disabled = !dirty;
  $('#btn-reset').disabled = !dirty;
}

async function load() {
  try {
    const settings = await api.get('/settings');
    render(settings);
    refreshButtons();
  } catch (error) {
    $('#settings-groups').innerHTML = `
      <p class="text-muted" style="font-size: var(--text-sm);">
        ⚠ No se pudo cargar la configuracion: ${escapeHtml(error.message)}
      </p>`;
  }
}

async function save(button) {
  const changes = collectChanges();

  if (Object.keys(changes).length === 0) {
    notify.info('No hay cambios que guardar');
    return;
  }

  const done = busyButton(button, 'Guardando…');

  try {
    const settings = await api.put('/settings', changes);
    notify.success(`${Object.keys(changes).length} opcion(es) guardadas`);
    render(settings);
    refreshButtons();
  } catch (error) {
    notifyApiError(error, 'No se pudo guardar la configuracion');
  } finally {
    done();
  }
}

/* ==========================================================================
   Estado del servidor
   ========================================================================== */

/** Segundos a un texto corto: 3 h 12 min. */
function uptimeText(seconds) {
  if (!Number.isFinite(seconds)) return '—';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${Math.round(seconds)} s`;
}

async function loadHealth() {
  try {
    const health = await api.health();

    $('#h-status').innerHTML = health.status === 'ok'
      ? '<span class="badge badge--success">Operativo</span>'
      : '<span class="badge badge--warning">Degradado</span>';

    $('#h-db').innerHTML = health.database?.connected
      ? `<span class="badge badge--success">Conectada</span>`
      : '<span class="badge badge--danger">Sin conexion</span>';

    $('#h-env').textContent = health.environment || '—';
    $('#h-uptime').textContent = uptimeText(health.uptimeSeconds);
  } catch (error) {
    $('#h-status').innerHTML = '<span class="badge badge--danger">Sin respuesta</span>';
    $('#h-db').textContent = '—';
    $('#h-env').textContent = '—';
    $('#h-uptime').textContent = error.message;
  }
}

/* -------------------------------------------------------------------------- */

function setupActions() {
  // Delegado: los controles se crean despues de cargar la configuracion.
  const form = $('#settings-form');

  form.addEventListener('input', (event) => {
    if (!event.target.dataset.key) return;

    // La etiqueta de la casilla acompana a su estado.
    if (event.target.dataset.type === 'boolean') {
      const label = event.target.nextElementSibling;
      if (label) label.textContent = event.target.checked ? 'Activado' : 'Desactivado';
    }

    refreshButtons();
  });

  form.addEventListener('change', refreshButtons);

  // Enter dentro del formulario guarda en vez de recargar la pagina.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save($('#btn-save'));
  });

  $('#btn-save').addEventListener('click', (event) => save(event.currentTarget));
  $('#btn-reset').addEventListener('click', () => load());
  $('#btn-health').addEventListener('click', () => loadHealth());
}

async function init() {
  const user = await requireAuth([ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Configuracion' });

  setupActions();
  await Promise.all([load(), loadHealth()]);
}

init();
