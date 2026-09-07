/**
 * auth.js - Sesion del usuario en el navegador.
 *
 * Responsabilidades:
 *   - Iniciar y cerrar sesion contra /api/auth.
 *   - Guardar el usuario y los tokens.
 *   - Proteger las paginas: cada pagina declara que roles la pueden ver.
 *
 * IMPORTANTE sobre la seguridad: esta proteccion es de EXPERIENCIA DE USUARIO,
 * no de seguridad real. Quien manda es el backend, que valida el token y el rol
 * en cada peticion. Aqui solo se evita mostrar una pantalla que igual no
 * traeria datos. Nunca se debe confiar en una comprobacion hecha en el cliente.
 */

import { CONFIG, ROLES, ROUTES } from './config.js';
import { api } from './api.js';
import { storage } from './utils.js';

/* --------------------------------------------------------------------------
 *  Usuario en sesion
 * ------------------------------------------------------------------------ */

export const session = {
  /** Usuario guardado, o null si no hay sesion. */
  get() {
    return storage.get(CONFIG.storage.user);
  },

  set(user) {
    storage.set(CONFIG.storage.user, user);
  },

  clear() {
    api.tokens.clear();
  },

  /** true si hay un token de acceso guardado. */
  isAuthenticated() {
    return Boolean(api.tokens.getAccess());
  },

  /** Codigo del rol del usuario en sesion. */
  role() {
    const user = session.get();
    return user ? user.role_code : null;
  },

  /** true si el usuario tiene alguno de los roles indicados. */
  hasRole(...roles) {
    const current = session.role();
    return roles.flat().includes(current);
  },

  /** Atajos legibles para las plantillas. */
  isAdmin: () => session.hasRole(ROLES.ADMINISTRADOR),
  isOperator: () => session.hasRole(ROLES.OPERADOR),
  isControlRoom: () => session.hasRole(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  isCitizen: () => session.hasRole(ROLES.CIUDADANO),
  isResponder: () => session.hasRole(ROLES.PERSONAL),
};

/* --------------------------------------------------------------------------
 *  Operaciones de sesion
 * ------------------------------------------------------------------------ */

/**
 * Inicia sesion y guarda tokens y usuario.
 * @returns {Promise<object>} El usuario autenticado.
 */
export async function login(email, password) {
  const data = await api.post('/auth/login', { email, password });

  api.tokens.set(data.accessToken, data.refreshToken);
  session.set(data.user);

  return data.user;
}

/** Registro de un ciudadano nuevo. Deja la sesion iniciada. */
export async function register(payload) {
  const data = await api.post('/auth/register', payload);

  api.tokens.set(data.accessToken, data.refreshToken);
  session.set(data.user);

  return data.user;
}

/**
 * Cierra la sesion.
 * Se avisa al backend para que revoque el token de refresco, pero si esa
 * llamada falla igualmente se limpia el navegador: el usuario pidio salir y
 * debe salir, aunque el servidor no responda.
 */
export async function logout(redirect = true) {
  try {
    const refreshToken = api.tokens.getRefresh();
    if (refreshToken) await api.post('/auth/logout', { refreshToken });
  } catch {
    // Sin conexion o token ya expirado: se continua con el cierre local.
  } finally {
    session.clear();
    if (redirect) window.location.href = ROUTES.login;
  }
}

/** Refresca el usuario guardado con lo que diga el servidor. */
export async function refreshProfile() {
  const user = await api.get('/auth/profile');
  session.set(user);
  return user;
}

/* --------------------------------------------------------------------------
 *  Proteccion de paginas
 * ------------------------------------------------------------------------ */

/**
 * ¿Se esta viendo en un dispositivo de mano (telefono o tablet)?
 *
 * Se decide por las capacidades del dispositivo y no por el user agent: el
 * user agent se falsea, cambia con cada version del navegador y hay que
 * mantener listas de cadenas.
 *
 * Son dos condiciones, y hace falta cualquiera de las dos:
 *
 *   max-width: 720px  Los mismos 720 px que ya usan `css/layout.css` y
 *                     `css/mobile.css` para cambiar de disposicion, para que no
 *                     haya dos ideas distintas de "esto es un telefono" en el
 *                     mismo proyecto.
 *
 *   pointer: coarse   El ancho solo no basta. Una tablet (iPad, Android
 *                     grande) pasa de 720 px y aterrizaba en el panel de
 *                     escritorio, sin boton SOS ni camara, aunque se maneje con
 *                     el dedo igual que un telefono. Esta consulta describe el
 *                     puntero PRINCIPAL, asi que un portatil con pantalla
 *                     tactil y raton sigue contando como escritorio.
 */
function isHandheld() {
  return window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
}

/**
 * Pagina de inicio que corresponde a cada rol al entrar.
 *
 * El personal va al mismo listado de emergencias que el centro de control: la
 * pagina se adapta al rol y consulta el endpoint que corresponde
 * (/emergencies, /emergencies/assigned o /emergencies/mine). Una sola pantalla
 * en lugar de tres casi identicas.
 *
 * El ciudadano es el unico caso que depende del dispositivo, y por un motivo
 * concreto: el boton SOS, la camara y el GPS estan en la PWA, no en el panel.
 * Un ciudadano que entrara desde el telefono y aterrizara en la tabla del
 * panel se quedaba sin la funcion principal de la aplicacion.
 */
export function homeForRole(roleCode) {
  switch (roleCode) {
    case ROLES.ADMINISTRADOR:
    case ROLES.OPERADOR:
      return ROUTES.dashboard;
    case ROLES.PERSONAL:
      return ROUTES.emergencies;
    case ROLES.CIUDADANO:
      return isHandheld() ? ROUTES.mobileHome : ROUTES.emergencies;
    default:
      return ROUTES.login;
  }
}

/**
 * Exige sesion (y opcionalmente un rol) para ver la pagina actual.
 *
 * Se llama al principio de cada modulo de pagina:
 *   const user = await requireAuth([ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
 *
 * Si no hay sesion redirige al login guardando a donde queria ir, para volver
 * ahi despues de entrar. Si hay sesion pero el rol no alcanza, lo manda a su
 * propia pagina de inicio en lugar de dejar una pantalla vacia.
 *
 * @param {string[]} allowedRoles Vacio = cualquier usuario autenticado.
 * @returns {Promise<object|null>} El usuario, o null si redirigio.
 */
export async function requireAuth(allowedRoles = []) {
  if (!session.isAuthenticated()) {
    const target = window.location.pathname + window.location.search;
    window.location.href = `${ROUTES.login}?next=${encodeURIComponent(target)}`;
    return null;
  }

  let user = session.get();

  // Sin usuario guardado (por ejemplo tras limpiar el almacenamiento) se pide
  // al servidor. Si el token ya no vale, la API responde 401 y se cierra.
  if (!user) {
    try {
      user = await refreshProfile();
    } catch {
      await logout();
      return null;
    }
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role_code)) {
    window.location.href = homeForRole(user.role_code);
    return null;
  }

  return user;
}

/**
 * Para el login y el registro: si ya hay sesion, no tiene sentido mostrarlos.
 * @returns {boolean} true si redirigio.
 */
export function redirectIfAuthenticated() {
  if (!session.isAuthenticated()) return false;

  const user = session.get();
  window.location.href = user ? homeForRole(user.role_code) : ROUTES.dashboard;
  return true;
}

export default { session, login, register, logout, requireAuth, refreshProfile };
