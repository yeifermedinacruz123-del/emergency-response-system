/**
 * layout.js - Armazon del panel: barra lateral, navbar y estado de conexion.
 *
 * Cada pagina del panel llama a mountLayout() y se olvida de la navegacion.
 * El menu se construye segun el rol: un ciudadano nunca ve la entrada de
 * "Usuarios" porque no se le pinta, y ademas el backend se la negaria.
 */

import { CONFIG, ROLES, ROUTES } from '../core/config.js';
import { session, logout } from '../core/auth.js';
import { realtime } from '../core/socket.js';
import { api } from '../core/api.js';
import { $, el, escapeHtml, initials, storage } from '../core/utils.js';
import { notify } from '../core/ui.js';

/**
 * Definicion del menu. `roles` vacio = visible para todos los autenticados.
 */
const MENU = [
  {
    section: 'Operacion',
    items: [
      { label: 'Dashboard', icon: '📊', route: ROUTES.dashboard, roles: [ROLES.OPERADOR, ROLES.ADMINISTRADOR] },
      { label: 'Emergencias', icon: '🚨', route: ROUTES.emergencies, roles: [] },
      { label: 'Mapa', icon: '🗺️', route: ROUTES.map, roles: [ROLES.OPERADOR, ROLES.ADMINISTRADOR] },
    ],
  },
  {
    section: 'Gestion',
    items: [
      { label: 'Personal', icon: '🚑', route: ROUTES.responders, roles: [ROLES.OPERADOR, ROLES.ADMINISTRADOR] },
      { label: 'Usuarios', icon: '👥', route: ROUTES.users, roles: [ROLES.ADMINISTRADOR] },
      { label: 'Estadisticas', icon: '📈', route: ROUTES.statistics, roles: [ROLES.OPERADOR, ROLES.ADMINISTRADOR] },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Notificaciones', icon: '🔔', route: ROUTES.notifications, roles: [], badge: 'notifications' },
      { label: 'Auditoria', icon: '🗂️', route: ROUTES.audit, roles: [ROLES.ADMINISTRADOR] },
      { label: 'Configuracion', icon: '⚙️', route: ROUTES.settings, roles: [ROLES.ADMINISTRADOR] },
    ],
  },
];

/** Filtra el menu por el rol del usuario. */
function menuForRole(roleCode) {
  return MENU.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.roles.length === 0 || item.roles.includes(roleCode)
    ),
  })).filter((group) => group.items.length > 0);
}

/** Marca como activa la entrada de la pagina actual. */
function isCurrent(route) {
  return window.location.pathname === route;
}

/* --------------------------------------------------------------------------
 *  Barra lateral
 * ------------------------------------------------------------------------ */

function buildSidebar(user) {
  const groups = menuForRole(user.role_code)
    .map(
      (group) => `
      <div class="sidebar__group">
        <p class="sidebar__section">${escapeHtml(group.section)}</p>
        <ul class="sidebar__list">
          ${group.items
            .map(
              (item) => `
            <li>
              <a href="${item.route}"
                 class="sidebar__link ${isCurrent(item.route) ? 'is-active' : ''}"
                 ${isCurrent(item.route) ? 'aria-current="page"' : ''}>
                <span class="sidebar__icon" aria-hidden="true">${item.icon}</span>
                <span class="sidebar__label">${escapeHtml(item.label)}</span>
                ${item.badge ? `<span class="sidebar__badge" data-badge="${item.badge}" hidden></span>` : ''}
              </a>
            </li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('');

  const aside = el('aside', { class: 'sidebar', id: 'sidebar' });
  aside.innerHTML = `
    <div class="sidebar__brand">
      <span class="sidebar__logo" aria-hidden="true">🚨</span>
      <div class="sidebar__brand-text">
        <strong>ERS</strong>
        <small>Centro de control</small>
      </div>
    </div>
    <nav class="sidebar__nav" aria-label="Navegacion principal">${groups}</nav>
    <div class="sidebar__footer">
      <button type="button" class="sidebar__collapse" id="btn-collapse" aria-label="Contraer menu">
        <span aria-hidden="true">◀</span>
        <span class="sidebar__label">Contraer</span>
      </button>
    </div>`;

  return aside;
}

/* --------------------------------------------------------------------------
 *  Navbar
 * ------------------------------------------------------------------------ */

function buildNavbar(user, pageTitle) {
  const header = el('header', { class: 'navbar' });
  header.innerHTML = `
    <div class="navbar__left">
      <button type="button" class="navbar__menu" id="btn-menu" aria-label="Abrir menu">
        <span aria-hidden="true">☰</span>
      </button>
      <div>
        <h1 class="navbar__title">${escapeHtml(pageTitle)}</h1>
        <p class="navbar__subtitle" id="navbar-subtitle"></p>
      </div>
    </div>

    <div class="navbar__right">
      <span class="live-dot" id="live-indicator" title="Estado de la conexion en tiempo real">
        <span class="live-dot__dot"></span>
        <span class="live-dot__text">Conectando…</span>
      </span>

      <a href="${ROUTES.notifications}" class="navbar__icon-btn" aria-label="Notificaciones">
        <span aria-hidden="true">🔔</span>
        <span class="navbar__badge" id="notif-badge" hidden></span>
      </a>

      <button type="button" class="navbar__icon-btn" id="btn-theme" aria-label="Cambiar tema">
        <span aria-hidden="true">🌓</span>
      </button>

      <div class="user-menu">
        <button type="button" class="user-menu__trigger" id="btn-user" aria-haspopup="true" aria-expanded="false">
          <span class="avatar" aria-hidden="true">${escapeHtml(initials(user.full_name))}</span>
          <span class="user-menu__info">
            <strong>${escapeHtml(user.full_name)}</strong>
            <small>${escapeHtml(user.role_name)}</small>
          </span>
          <span class="user-menu__caret" aria-hidden="true">▾</span>
        </button>
        <div class="user-menu__dropdown" id="user-dropdown" hidden>
          <p class="user-menu__email">${escapeHtml(user.email)}</p>
          ${user.role_code === ROLES.CIUDADANO ? `
            <a class="user-menu__item" href="${ROUTES.mobileHome}">
              Abrir la app de emergencias
            </a>` : ''}
          <button type="button" class="user-menu__item" id="btn-logout">Cerrar sesion</button>
        </div>
      </div>
    </div>`;

  return header;
}

/* --------------------------------------------------------------------------
 *  Comportamiento
 * ------------------------------------------------------------------------ */

/** Contrae y expande la barra lateral, recordando la eleccion. */
function setupSidebarToggle() {
  const shell = $('.app-shell');
  const collapsed = storage.get(CONFIG.storage.sidebarCollapsed, false);
  if (collapsed) shell.classList.add('is-collapsed');

  const collapseButton = $('#btn-collapse');
  if (collapseButton) {
    collapseButton.addEventListener('click', () => {
      shell.classList.toggle('is-collapsed');
      storage.set(CONFIG.storage.sidebarCollapsed, shell.classList.contains('is-collapsed'));
    });
  }

  // En movil la barra se superpone en vez de contraerse.
  const menuButton = $('#btn-menu');
  if (menuButton) {
    menuButton.addEventListener('click', () => shell.classList.toggle('is-sidebar-open'));
  }

  // Al tocar fuera del menu en movil, se cierra.
  document.addEventListener('click', (event) => {
    if (!shell.classList.contains('is-sidebar-open')) return;
    if (event.target.closest('#sidebar') || event.target.closest('#btn-menu')) return;
    shell.classList.remove('is-sidebar-open');
  });
}

/**
 * Tema claro / oscuro, recordado entre visitas.
 *
 * El valor inicial ya lo aplica el script del <head> de cada pagina (para
 * pintar directo en el tema correcto, sin parpadeo); aqui solo se cablea
 * el boton.
 */
function setupTheme() {
  const button = $('#btn-theme');
  if (!button) return;

  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    // Valor plano, sin pasar por storage.set: el script del <head> que evita
    // el parpadeo lee esta misma clave con localStorage.getItem() en crudo,
    // sin JSON.parse, para poder ejecutarse antes de cargar ningun modulo.
    localStorage.setItem(CONFIG.storage.theme, next);
  });
}

/** Menu del usuario. */
function setupUserMenu() {
  const trigger = $('#btn-user');
  const dropdown = $('#user-dropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', () => {
    dropdown.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  const logoutButton = $('#btn-logout');
  if (logoutButton) logoutButton.addEventListener('click', () => logout());
}

/** Indicador "En vivo" ligado al estado real del socket. */
function setupLiveIndicator() {
  const indicator = $('#live-indicator');
  if (!indicator) return;

  const dot = indicator.querySelector('.live-dot__dot');
  const text = indicator.querySelector('.live-dot__text');

  const LABELS = {
    connected: { text: 'En vivo', state: 'ok' },
    connecting: { text: 'Conectando…', state: 'wait' },
    disconnected: { text: 'Sin conexion', state: 'off' },
    error: { text: 'Sin conexion', state: 'off' },
  };

  realtime.onStatusChange((status) => {
    const meta = LABELS[status] || LABELS.disconnected;
    text.textContent = meta.text;
    dot.dataset.state = meta.state;
    indicator.dataset.state = meta.state;
  });
}

/* --------------------------------------------------------------------------
 *  Notificaciones en la interfaz
 * ------------------------------------------------------------------------ */

/** Actualiza el contador de la campana y del menu lateral. */
async function refreshNotificationBadge() {
  try {
    const data = await api.get('/notifications/unread-count');
    setNotificationCount(data.unread);
  } catch {
    // Un fallo del contador no debe romper la pagina.
  }
}

function setNotificationCount(count) {
  const badge = $('#notif-badge');
  const sidebarBadge = document.querySelector('[data-badge="notifications"]');
  const label = count > 99 ? '99+' : String(count);

  [badge, sidebarBadge].forEach((node) => {
    if (!node) return;
    node.textContent = label;
    node.hidden = count === 0;
  });
}

/**
 * Conecta el tiempo real del armazon: contador de notificaciones y avisos
 * emergentes. Cada pagina añade despues sus propios manejadores.
 */
async function setupRealtime() {
  await realtime.connect();

  realtime.on('notification:new', (notification) => {
    refreshNotificationBadge();

    // Un SOS interrumpe: es lo unico que justifica robar la atencion.
    const isSos = notification.type === 'SOS';
    notify[isSos ? 'error' : 'info'](
      `${notification.icon || ''} ${notification.title}: ${notification.message}`,
      isSos ? 12000 : 5000
    );
  });

  await refreshNotificationBadge();
}

/* --------------------------------------------------------------------------
 *  Montaje
 * ------------------------------------------------------------------------ */

/**
 * Construye el armazon alrededor del contenido de la pagina.
 *
 * La pagina debe tener en su HTML:
 *   <div class="app-shell"><main class="app-main" id="page"> … </main></div>
 *
 * @param {object} options
 * @param {object} options.user      Usuario autenticado.
 * @param {string} options.title     Titulo que se muestra en la navbar.
 * @param {string} [options.subtitle]
 * @param {boolean} [options.realtime=true] Conectar el tiempo real.
 */
export async function mountLayout({ user, title, subtitle = '', realtime: useRealtime = true }) {
  const shell = $('.app-shell');
  if (!shell) throw new Error('La pagina no tiene el contenedor .app-shell');

  shell.prepend(buildSidebar(user));

  const main = $('.app-main');
  main.prepend(buildNavbar(user, title));

  if (subtitle) $('#navbar-subtitle').textContent = subtitle;

  setupSidebarToggle();
  setupTheme();
  setupUserMenu();

  if (useRealtime) {
    setupLiveIndicator();
    await setupRealtime();
  } else {
    const indicator = $('#live-indicator');
    if (indicator) indicator.remove();
  }

  return { setNotificationCount, refreshNotificationBadge };
}

/** Cambia el subtitulo de la navbar desde la pagina. */
export function setSubtitle(text) {
  const node = $('#navbar-subtitle');
  if (node) node.textContent = text;
}

export default { mountLayout, setSubtitle };
