/**
 * notifications.js - Bandeja de notificaciones del panel.
 *
 * Es la version de escritorio de la bandeja que el ciudadano ve en la PWA.
 * La usan todos los roles: es la unica pantalla del menu "Sistema" que no esta
 * restringida al administrador.
 *
 * Las notificaciones llegan por dos vias que se complementan:
 *   - Socket.IO, mientras la pagina esta abierta.
 *   - Esta bandeja, que conserva lo ocurrido aunque no hubiera nadie delante.
 */

import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { notify, notifyApiError, busyButton } from '../core/ui.js';
import { $, escapeHtml, timeAgo, formatDateTime } from '../core/utils.js';
import push from '../core/push.js';

const PAGE_SIZE = 20;

const state = {
  page: 1,
  onlyUnread: false,
  total: 0,
};

/** Referencia al armazon, para refrescar el contador de la campana. */
let layout = null;

/* ==========================================================================
   Listado
   ========================================================================== */

function item(notification) {
  const link = notification.emergency_id
    ? `/pages/emergency-detail.html?id=${notification.emergency_id}`
    : null;

  const tag = link ? 'a' : 'div';
  const href = link ? ` href="${link}"` : '';

  return `
    <${tag}${href} class="notif ${notification.is_read ? 'is-read' : ''}"
        data-id="${notification.id}">
      <span class="notif__icon" aria-hidden="true">${notification.icon || '🔔'}</span>

      <span class="notif__body">
        <span class="notif__head">
          <strong class="notif__title">${escapeHtml(notification.title)}</strong>
          ${notification.is_read ? '' : '<span class="badge badge--info">Nuevo</span>'}
          ${notification.emergency_code
            ? `<span class="notif__code">${escapeHtml(notification.emergency_code)}</span>`
            : ''}
        </span>
        <span class="notif__message">${escapeHtml(notification.message)}</span>
      </span>

      <span class="notif__time" title="${escapeHtml(formatDateTime(notification.created_at))}">
        ${escapeHtml(timeAgo(notification.created_at))}
      </span>
    </${tag}>`;
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
  info.textContent = `Mostrando ${from}–${to} de ${meta.total} notificacion(es)`;

  controls.innerHTML = `
    <button type="button" class="pagination__page" data-page="${meta.page - 1}"
            ${meta.hasPreviousPage ? '' : 'disabled'} aria-label="Anterior">‹</button>
    <span class="pagination__info">Pagina ${meta.page} de ${meta.totalPages}</span>
    <button type="button" class="pagination__page" data-page="${meta.page + 1}"
            ${meta.hasNextPage ? '' : 'disabled'} aria-label="Siguiente">›</button>`;
}

/** Bloque de estado (cargando, vacio, error) con el mismo aspecto en los tres. */
function message({ icon, title, description = '' }) {
  return `
    <div class="notif-empty">
      <span class="notif-empty__icon" aria-hidden="true">${icon}</span>
      <p class="notif-empty__title">${escapeHtml(title)}</p>
      ${description ? `<p class="notif-empty__text">${escapeHtml(description)}</p>` : ''}
    </div>`;
}

async function load() {
  const list = $('#list');
  list.innerHTML = `
    <div class="notif-empty">
      <span class="spinner" aria-hidden="true"></span>
      <p class="notif-empty__text">Cargando notificaciones…</p>
    </div>`;

  const params = { page: state.page, limit: PAGE_SIZE };
  if (state.onlyUnread) params.unread = 'true';

  try {
    const result = await api.get('/notifications', params);
    const items = result.items || [];
    state.total = result.meta ? result.meta.total : items.length;

    if (items.length === 0) {
      list.innerHTML = message({
        icon: '🔔',
        title: state.onlyUnread ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones',
        description: state.onlyUnread
          ? 'Cambia el filtro a "Todas" para ver el historial.'
          : 'Aqui apareceran las novedades de las emergencias: altas, asignaciones y cierres.',
      });
    } else {
      list.innerHTML = items.map(item).join('');
    }

    renderPagination(result.meta);

    const unread = await api.get('/notifications/unread-count');
    setSubtitle(
      unread.unread > 0
        ? `${unread.unread} sin leer de ${state.total}`
        : `${state.total} notificacion(es)`
    );
    $('#summary').textContent = unread.unread > 0
      ? `${unread.unread} sin leer`
      : 'Todo al dia';
  } catch (error) {
    list.innerHTML = message({
      icon: '⚠',
      title: 'No se pudieron cargar las notificaciones',
      description: error.message,
    });
    renderPagination(null);
  }
}

/* ==========================================================================
   Interaccion
   ========================================================================== */

function setupInteractions() {
  // Al abrir una notificacion se marca como leida. No se espera la respuesta
  // para navegar: la peticion sigue en marcha mientras se abre la emergencia.
  $('#list').addEventListener('click', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card || card.classList.contains('is-read')) return;

    const id = Number.parseInt(card.dataset.id, 10);
    api.patch(`/notifications/${id}/read`)
      .then(() => layout && layout.refreshNotificationBadge())
      .catch(() => {});

    card.classList.add('is-read');
  });

  $('#btn-read-all').addEventListener('click', async (event) => {
    const done = busyButton(event.currentTarget, 'Marcando…');

    try {
      const result = await api.patch('/notifications/read-all');
      notify.success(
        result.updated > 0
          ? `${result.updated} notificacion(es) marcadas como leidas`
          : 'No tenias notificaciones sin leer'
      );
      if (layout) await layout.refreshNotificationBadge();
      state.page = 1;
      await load();
    } catch (error) {
      notifyApiError(error, 'No se pudieron marcar las notificaciones');
    } finally {
      done();
    }
  });

  $('#btn-refresh').addEventListener('click', () => load());

  $('#f-state').addEventListener('change', (event) => {
    state.onlyUnread = event.target.value === 'unread';
    state.page = 1;
    load();
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

/* ==========================================================================
   Notificaciones del navegador (push)
   ========================================================================== */

/**
 * Pinta el estado de las push y su boton.
 * Cada situacion lleva su propio mensaje: decir solo "no funciona" deja al
 * usuario sin saber si es culpa suya o del sistema.
 */
async function renderPushState() {
  const section = $('#push-section');
  const text = $('#push-state');
  const button = $('#btn-push');
  const testButton = $('#btn-push-test');

  const status = await push.getStatus();
  section.hidden = false;

  if (!status.supported) {
    text.textContent = status.reason;
    button.hidden = true;
    testButton.hidden = true;
    return;
  }

  if (status.subscribed) {
    text.textContent = 'Activadas. Recibiras avisos aunque cierres esta pestana.';
    button.hidden = false;
    button.textContent = 'Desactivar';
    button.className = 'btn btn--ghost btn--sm';
    testButton.hidden = false;
    return;
  }

  if (status.permission === 'denied') {
    text.textContent = 'Bloqueaste las notificaciones. Actívalas en los ajustes del sitio '
      + 'en tu navegador.';
    button.hidden = true;
    testButton.hidden = true;
    return;
  }

  text.textContent = status.reason
    || 'Actívalas para enterarte de las emergencias nuevas aunque no tengas el panel abierto.';
  button.hidden = false;
  button.textContent = 'Activar';
  button.className = 'btn btn--primary btn--sm';
  testButton.hidden = true;
}

function setupPush() {
  $('#btn-push').addEventListener('click', async (event) => {
    const done = busyButton(event.currentTarget, '…');

    const status = await push.getStatus();
    const result = status.subscribed ? await push.unsubscribe() : await push.subscribe();

    done();

    if (result.ok) notify.success(result.message);
    else notify.warning(result.message);

    await renderPushState();
  });

  $('#btn-push-test').addEventListener('click', async (event) => {
    const done = busyButton(event.currentTarget, 'Enviando…');
    const result = await push.sendTest();
    done();

    if (result.ok) notify.success(result.message);
    else notify.warning(result.message);
  });
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth();
  if (!user) return;

  layout = await mountLayout({ user, title: 'Notificaciones' });

  setupInteractions();
  setupPush();
  renderPushState();

  // Una notificacion nueva entra en la lista sin recargar la pagina.
  realtime.on('notification:new', () => {
    if (state.page === 1) load();
  });

  await load();
}

init();
