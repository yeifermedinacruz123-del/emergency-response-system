/**
 * notifications.js - Bandeja de avisos del ciudadano (PWA).
 *
 * Las notificaciones llegan por dos vias que se complementan:
 *   - Socket.IO, mientras la app esta abierta.
 *   - Esta bandeja, que guarda todo lo ocurrido aunque el telefono estuviera
 *     apagado.
 */

import { initMobilePage, refreshBadge } from './app.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { $, escapeHtml, timeAgo, formatDateTime } from '../core/utils.js';
import { notify, notifyApiError, busyButton } from '../core/ui.js';
import push from '../core/push.js';

const PAGE_SIZE = 15;

const state = { page: 1, total: 0, unread: 0, loading: false };

function item(notification) {
  const link = notification.emergency_id
    ? `/app/emergency.html?id=${notification.emergency_id}`
    : null;

  const inner = `
    <div class="m-card__top">
      <span aria-hidden="true" style="font-size: var(--text-lg);">${notification.icon || '🔔'}</span>
      <span class="m-card__code">${escapeHtml(notification.emergency_code || '')}</span>
      ${notification.is_read ? '' : '<span class="badge badge--info">Nuevo</span>'}
    </div>
    <p class="m-card__title" style="font-size: var(--text-sm);">
      ${escapeHtml(notification.title)}
    </p>
    <p style="font-size: var(--text-sm); color: var(--text-muted); line-height: 1.45; margin-top: var(--space-1);">
      ${escapeHtml(notification.message)}
    </p>
    <div class="m-card__meta" style="margin-top: var(--space-2);">
      <span title="${escapeHtml(formatDateTime(notification.created_at))}">
        ${escapeHtml(timeAgo(notification.created_at))}
      </span>
    </div>`;

  const style = notification.is_read ? 'opacity: .72;' : '';

  return link
    ? `<a href="${link}" class="m-card" data-id="${notification.id}" style="${style}">${inner}</a>`
    : `<div class="m-card" data-id="${notification.id}" style="cursor: default; ${style}">${inner}</div>`;
}

async function load({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  const list = $('#list');

  if (!append) {
    list.innerHTML = `
      <div class="m-empty">
        <span class="spinner" aria-hidden="true"></span>
        <p class="m-empty__text">Cargando avisos…</p>
      </div>`;
  }

  try {
    const result = await api.get('/notifications', { page: state.page, limit: PAGE_SIZE });
    const items = result.items || [];
    const meta = result.meta;

    state.total = meta ? meta.total : items.length;

    if (!append) list.innerHTML = '';

    if (items.length === 0 && !append) {
      list.innerHTML = `
        <div class="m-empty">
          <span class="m-empty__icon" aria-hidden="true">🔔</span>
          <p class="m-empty__title">No tienes avisos</p>
          <p class="m-empty__text">
            Aqui apareceran las novedades de tus reportes: cuando se asigne
            personal y cuando se resuelvan.
          </p>
        </div>`;
    } else {
      list.insertAdjacentHTML('beforeend', items.map(item).join(''));
    }

    $('#btn-more').hidden = !(meta && meta.hasNextPage);

    state.unread = await refreshBadge();
    $('#summary').textContent = state.unread > 0
      ? `${state.unread} sin leer de ${state.total}`
      : `${state.total} aviso(s)`;
  } catch (error) {
    if (!append) {
      list.innerHTML = `
        <div class="m-empty">
          <span class="m-empty__icon" aria-hidden="true">⚠</span>
          <p class="m-empty__title">No se pudieron cargar los avisos</p>
          <p class="m-empty__text">${escapeHtml(error.message)}</p>
        </div>`;
    }
  } finally {
    state.loading = false;
  }
}

/**
 * Marca como leido al tocar el aviso.
 * No se espera a la respuesta para navegar: la peticion sigue en marcha
 * mientras se abre la emergencia, y si falla no pasa nada grave.
 */
function setupInteractions() {
  $('#list').addEventListener('click', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) return;

    const id = Number.parseInt(card.dataset.id, 10);
    api.patch(`/notifications/${id}/read`).then(refreshBadge).catch(() => {});
  });

  $('#btn-read-all').addEventListener('click', async () => {
    try {
      const result = await api.patch('/notifications/read-all');
      notify.success(
        result.updated > 0
          ? `${result.updated} aviso(s) marcados como leidos`
          : 'No tenias avisos sin leer'
      );
      state.page = 1;
      await load();
    } catch (error) {
      notifyApiError(error, 'No se pudieron marcar los avisos');
    }
  });

  $('#btn-more').addEventListener('click', () => {
    state.page += 1;
    load({ append: true });
  });
}

/* ==========================================================================
   Notificaciones del telefono (push)
   ========================================================================== */

/**
 * Pinta el estado de las notificaciones push y su boton.
 * Cada situacion tiene su propio mensaje: "no funciona" sin explicar por que
 * deja al usuario sin saber si es culpa suya o del sistema.
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
    text.textContent = 'Activados. Recibiras avisos aunque la app este cerrada.';
    button.hidden = false;
    button.textContent = 'Desactivar';
    button.className = 'btn btn--ghost btn--sm';
    testButton.hidden = false;
    return;
  }

  if (status.permission === 'denied') {
    text.textContent = 'Bloqueaste las notificaciones. Actívalas en los ajustes del sitio en tu navegador.';
    button.hidden = true;
    testButton.hidden = true;
    return;
  }

  text.textContent = status.reason
    || 'Actívalos para enterarte del avance de tus reportes aunque no tengas la app abierta.';
  button.hidden = false;
  button.textContent = 'Activar';
  button.className = 'btn btn--primary btn--sm';
  testButton.hidden = true;
}

function setupPush() {
  $('#btn-push').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const restore = busyButton(button, '…');

    const status = await push.getStatus();
    const result = status.subscribed ? await push.unsubscribe() : await push.subscribe();

    restore();

    if (result.ok) notify.success(result.message);
    else notify.warning(result.message);

    await renderPushState();
  });

  $('#btn-push-test').addEventListener('click', async (event) => {
    const restore = busyButton(event.currentTarget, 'Enviando…');
    const result = await push.sendTest();
    restore();

    if (result.ok) notify.success(result.message);
    else notify.warning(result.message);
  });
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await initMobilePage({ nav: 'alerts' });
  if (!user) return;

  setupInteractions();
  setupPush();
  renderPushState();

  // Un aviso nuevo entra en la lista sin recargar.
  realtime.on('notification:new', () => {
    state.page = 1;
    load();
  });

  await load();
}

init();
