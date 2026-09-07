/**
 * app.js - Base compartida por todas las pantallas de la PWA.
 *
 * Se encarga de lo que se repite en cada pantalla: registrar el service
 * worker, pintar la navegacion inferior, ofrecer la instalacion y avisar
 * cuando no hay conexion. La ubicacion la lleva `core/geo.js`.
 */

import { CONFIG, ROLES, ROUTES } from '../core/config.js';
import { requireAuth, session, logout } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { $, el, escapeHtml, initials } from '../core/utils.js';
import { notify } from '../core/ui.js';
import { resumeIfEnabled as resumeSeismicIfEnabled } from './seismic.js';
import { listQueuedReports, removeQueuedReport } from '../core/offlineQueue.js';

/* ==========================================================================
   Service worker
   ========================================================================== */

/**
 * Registra el service worker.
 *
 * Solo funciona en contexto seguro: HTTPS o localhost. Por eso el backend
 * sirve el frontend desde su mismo origen, para que en desarrollo se pueda
 * probar la PWA sin certificados.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.info('Este navegador no admite service workers: la app funcionara sin modo offline.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });

    // Si hay una version nueva esperando, se avisa en lugar de actualizar de
    // golpe: recargar sin permiso podria interrumpir un reporte a medias.
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          notify.info('Hay una version nueva de la aplicacion. Cierrala y vuelve a abrirla.', 8000);
        }
      });
    });

    return registration;
  } catch (error) {
    console.warn('No se pudo registrar el service worker:', error.message);
    return null;
  }
}

/* ==========================================================================
   Instalacion
   ========================================================================== */

/** Evento guardado para poder lanzar la instalacion cuando el usuario quiera. */
let installPrompt = null;

/**
 * Prepara la franja de instalacion.
 * El navegador solo dispara beforeinstallprompt cuando la PWA cumple los
 * requisitos (manifest valido, service worker, contexto seguro). Si no llega,
 * la franja no se muestra: no tiene sentido ofrecer algo que no funcionaria.
 */
export function setupInstallBanner() {
  const banner = $('#install-banner');
  if (!banner) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Se impide el aviso automatico para mostrarlo donde encaja en la interfaz.
    event.preventDefault();
    installPrompt = event;
    banner.classList.add('is-visible');
  });

  const button = banner.querySelector('[data-install]');
  if (button) {
    button.addEventListener('click', async () => {
      if (!installPrompt) return;

      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === 'accepted') notify.success('Aplicacion instalada');
      installPrompt = null;
      banner.classList.remove('is-visible');
    });
  }

  const dismiss = banner.querySelector('[data-dismiss]');
  if (dismiss) {
    dismiss.addEventListener('click', () => banner.classList.remove('is-visible'));
  }

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('is-visible');
    installPrompt = null;
  });
}

/* ==========================================================================
   Conexion
   ========================================================================== */

/** Muestra u oculta el aviso de "sin conexion". */
export function setupOfflineBanner() {
  const banner = $('#offline-banner');
  if (!banner) return;

  const update = () => banner.classList.toggle('is-visible', !navigator.onLine);

  window.addEventListener('online', () => {
    update();
    notify.success('Conexion restablecida');
    flushOfflineQueue();
  });

  window.addEventListener('offline', () => {
    update();
    notify.warning('Sin conexion. Puedes consultar lo ya cargado.');
  });

  update();
}

/* ==========================================================================
   Reportes guardados sin conexion
   ========================================================================== */

/** Evita reintentar dos veces a la vez (por ejemplo, "online" y el arranque). */
let flushing = false;

/**
 * Reenvia los reportes que se guardaron en el telefono porque no habia
 * conexion cuando se intentaron enviar. Se llama al recuperar la señal y al
 * abrir cualquier pantalla, por si el telefono se cerro estando sin conexion.
 */
export async function flushOfflineQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;

  try {
    const pending = await listQueuedReports();
    if (pending.length === 0) return;

    let sent = 0;

    for (const item of pending) {
      const form = new FormData();
      Object.entries(item.fields).forEach(([key, value]) => form.append(key, value));
      item.photos.forEach((file, index) => form.append('photos', file, file.name || `foto-${index}.jpg`));
      if (item.audio) form.append('audio', item.audio, 'nota-de-voz.webm');

      try {
        // eslint-disable-next-line no-await-in-loop -- se envian uno a uno a
        // proposito: mandarlos todos a la vez podria saturar una conexion que
        // recien volvio y es todavia inestable.
        await api.upload('/emergencies', form);
        // eslint-disable-next-line no-await-in-loop
        await removeQueuedReport(item.id);
        sent += 1;
      } catch (error) {
        // Si vuelve a fallar por conexion, se deja en la cola para el proximo
        // intento. Si el backend lo rechaza (422), tambien: perderlo seria peor
        // que insistir con un reporte invalido que el usuario puede corregir.
        if (error.code === 'NETWORK_ERROR') break;
      }
    }

    if (sent > 0) {
      notify.success(
        sent === 1
          ? 'Se envio el reporte que tenias pendiente.'
          : `Se enviaron ${sent} reportes que tenias pendientes.`,
        8000
      );
      document.dispatchEvent(new CustomEvent('ers:offline-queue-flushed'));
    }
  } catch {
    // IndexedDB no disponible (modo privado en algunos navegadores): no hay
    // cola que vaciar.
  } finally {
    flushing = false;
  }
}

/*
 * La ubicacion vive en `core/geo.js`, junto con la ventana que explica que
 * hacer cuando el permiso esta bloqueado. Las pantallas la piden con
 * `askForLocation`, no desde aqui.
 */

/**
 * Vibra el telefono si el navegador lo permite.
 * Es una confirmacion tactil util cuando el usuario no esta mirando la
 * pantalla, por ejemplo al pulsar el SOS.
 */
export function vibrate(pattern = 60) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Algunos navegadores lo bloquean sin interaccion previa. No importa.
    }
  }
}

/* ==========================================================================
   Tema claro / oscuro
   ========================================================================== */

/**
 * Agrega el interruptor de tema a la cabecera de la pantalla, si tiene una.
 * El valor inicial ya lo aplica el script del <head> de cada pagina (para
 * pintar directo en el tema correcto, sin parpadeo); aqui solo se pinta el
 * boton y se cablea el clic. No todas las pantallas tienen el mismo layout
 * de cabecera, asi que el contenedor de acciones se crea si falta.
 */
function setupMobileTheme() {
  const header = $('.m-header');
  if (!header) return;

  let actions = header.querySelector('.m-header__actions');
  if (!actions) {
    actions = el('div', { class: 'm-header__actions' });
    header.appendChild(actions);
  }

  const button = el(
    'button',
    { type: 'button', class: 'm-header__btn', id: 'btn-theme', 'aria-label': 'Cambiar tema' },
    el('span', { 'aria-hidden': 'true' }, '🌓')
  );
  actions.prepend(button);

  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(CONFIG.storage.theme, next);
  });
}

/* ==========================================================================
   Navegacion inferior
   ========================================================================== */

const NAV_ITEMS = [
  { key: 'home', label: 'Inicio', icon: '🏠', route: '/app/index.html' },
  { key: 'report', label: 'Reportar', icon: '📝', route: '/app/report.html' },
  { key: 'list', label: 'Mis reportes', icon: '📋', route: '/app/my-emergencies.html' },
  { key: 'alerts', label: 'Avisos', icon: '🔔', route: '/app/notifications.html', badge: true },
];

/** Pinta la barra de navegacion inferior y marca la pantalla actual. */
export function mountNav(activeKey) {
  const nav = el('nav', { class: 'm-nav', 'aria-label': 'Navegacion principal' });

  nav.innerHTML = NAV_ITEMS.map((item) => `
    <a href="${item.route}" class="m-nav__item ${item.key === activeKey ? 'is-active' : ''}"
       ${item.key === activeKey ? 'aria-current="page"' : ''}>
      <span class="m-nav__icon" aria-hidden="true">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
      ${item.badge ? '<span class="m-nav__badge" id="nav-badge" hidden></span>' : ''}
    </a>`).join('');

  document.body.appendChild(nav);
}

/** Actualiza el contador de avisos sin leer. */
export async function refreshBadge() {
  try {
    const data = await api.get('/notifications/unread-count');
    const count = data.unread;

    [$('#nav-badge'), $('#header-badge')].forEach((node) => {
      if (!node) return;
      node.textContent = count > 99 ? '99+' : String(count);
      node.hidden = count === 0;
    });

    return count;
  } catch {
    return 0;
  }
}

/* ==========================================================================
   Arranque comun
   ========================================================================== */

/**
 * Prepara una pantalla de la PWA: exige sesion, monta la navegacion, registra
 * el service worker y conecta el tiempo real.
 *
 * @param {object} options
 * @param {string} options.nav          Clave de la pestaña activa.
 * @param {boolean} [options.realtime]  Conectar Socket.IO.
 * @returns {Promise<object|null>} El usuario, o null si redirigio al login.
 */
export async function initMobilePage({ nav, realtime: useRealtime = true } = {}) {
  // La PWA es para ciudadanos; el resto de roles trabaja en el panel web.
  const user = await requireAuth([ROLES.CIUDADANO, ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
  if (!user) return null;

  registerServiceWorker();
  setupOfflineBanner();
  setupInstallBanner();
  setupMobileTheme();
  resumeSeismicIfEnabled();
  flushOfflineQueue();

  if (nav) mountNav(nav);

  const logoutButton = $('#btn-logout');
  if (logoutButton) logoutButton.addEventListener('click', () => logout());

  if (useRealtime) {
    await realtime.connect();

    realtime.on('notification:new', (notification) => {
      refreshBadge();
      vibrate(notification.type === 'SOS' ? [200, 100, 200] : 60);
      notify.info(`${notification.icon || ''} ${notification.title}`, 6000);
    });
  }

  refreshBadge();

  return user;
}

export { session, api, realtime, CONFIG, ROUTES, initials };
