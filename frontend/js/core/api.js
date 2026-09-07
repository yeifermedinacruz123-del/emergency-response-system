/**
 * api.js - Cliente HTTP del frontend.
 *
 * Unico punto por el que pasan TODAS las llamadas a la API. Se encarga de:
 *   - agregar la cabecera Authorization con el token guardado,
 *   - aplicar un tiempo maximo de espera,
 *   - normalizar la respuesta { success, message, data, meta },
 *   - renovar automaticamente el token de acceso cuando expira (401),
 *   - lanzar un ApiError con el mensaje real del backend.
 *
 * Uso:
 *   import { api } from './core/api.js';
 *   const emergencias = await api.get('/emergencies', { status: 'PENDIENTE' });
 */

import { CONFIG } from './config.js';
import { buildQuery, storage } from './utils.js';

/** Error con la informacion que devolvio el backend. */
export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], code = null, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.code = code;
    /** Cuerpo "data" de la respuesta fallida. Algunos errores (por ejemplo el
     *  503 de /api/health) traen informacion util para el diagnostico. */
    this.data = data;
  }

  /** Devuelve el mensaje de un campo concreto, si el backend lo envio. */
  fieldError(field) {
    const found = this.errors.find((item) => item.field === field);
    return found ? found.message : null;
  }
}

/* --------------------------------------------------------------------------
 *  Tokens
 * ------------------------------------------------------------------------ */

const tokens = {
  getAccess: () => storage.get(CONFIG.storage.accessToken),
  getRefresh: () => storage.get(CONFIG.storage.refreshToken),
  set(accessToken, refreshToken) {
    storage.set(CONFIG.storage.accessToken, accessToken);
    if (refreshToken) storage.set(CONFIG.storage.refreshToken, refreshToken);
  },
  clear() {
    storage.remove(CONFIG.storage.accessToken);
    storage.remove(CONFIG.storage.refreshToken);
    storage.remove(CONFIG.storage.user);
  },
};

/**
 * Evita que varias peticiones simultaneas disparen varios refresh a la vez:
 * la primera crea la promesa y las demas esperan esa misma promesa.
 */
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = tokens.getRefresh();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${CONFIG.api.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json();
        const newAccess = body?.data?.accessToken;
        if (!newAccess) return null;
        tokens.set(newAccess, body?.data?.refreshToken);
        return newAccess;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/** Se dispara cuando la sesion ya no puede recuperarse. */
function forceLogout() {
  tokens.clear();
  document.dispatchEvent(new CustomEvent('ers:session-expired'));
  const current = window.location.pathname;
  if (!current.endsWith('login.html') && !current.endsWith('register.html')) {
    window.location.href = `${CONFIG.routes.login}?expired=1`;
  }
}

/* --------------------------------------------------------------------------
 *  Peticion base
 * ------------------------------------------------------------------------ */

async function request(method, path, { query, body, isFormData = false, retry = true } = {}) {
  const url = `${CONFIG.api.baseUrl}${path}${buildQuery(query)}`;

  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const accessToken = tokens.getAccess();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.api.timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError('La peticion tardo demasiado. Revisa tu conexion.', { code: 'TIMEOUT' });
    }
    throw new ApiError('No se pudo conectar con el servidor.', { code: 'NETWORK_ERROR' });
  }
  clearTimeout(timeoutId);

  // 204 sin contenido
  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // Token expirado: intentar renovar una sola vez y repetir la peticion.
  if (response.status === 401 && retry && tokens.getRefresh()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request(method, path, { query, body, isFormData, retry: false });
    }
    forceLogout();
  }

  if (!response.ok) {
    throw new ApiError(payload?.message || `Error ${response.status}`, {
      status: response.status,
      errors: payload?.errors || [],
      code: payload?.code || null,
      data: payload?.data || null,
    });
  }

  // Devuelve el objeto completo cuando hay metadatos de paginacion,
  // y solo los datos cuando no los hay.
  if (payload && payload.meta) return { items: payload.data, meta: payload.meta };
  return payload ? payload.data : null;
}

/* --------------------------------------------------------------------------
 *  Descarga de archivos
 * ------------------------------------------------------------------------ */

/**
 * Descarga un archivo protegido por sesion.
 *
 * No se puede usar un <a href> normal porque el enlace no lleva la cabecera
 * Authorization: el servidor respondera 401. Hay que pedirlo con fetch, meter
 * la respuesta en un blob y simular el clic sobre ese blob.
 *
 * @param {string} path Ruta bajo /api
 * @param {string} filename Nombre con el que se guarda
 */
async function download(path, filename) {
  const accessToken = tokens.getAccess();

  const response = await fetch(`${CONFIG.api.baseUrl}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    // El error si viene en JSON: se aprovecha para dar el mensaje del servidor.
    let message = `Error ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      // Respuesta no JSON: se queda el mensaje generico.
    }
    throw new ApiError(message, { status: response.status });
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Se libera en el siguiente ciclo: revocarlo de inmediato cancela la descarga
  // en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------------------
 *  API publica del modulo
 * ------------------------------------------------------------------------ */

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body, query) => request('POST', path, { body, query }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  // DELETE admite cuerpo: se usa para dar de baja una suscripcion push, que
  // se identifica por su endpoint (una URL larga que no cabe bien en la ruta).
  delete: (path, body) => request('DELETE', path, { body }),

  /** Envio de formularios con archivos (fotografias de una emergencia). */
  upload: (path, formData) => request('POST', path, { body: formData, isFormData: true }),

  /** Descarga de un archivo protegido (hoja de accesos, informes...). */
  download,

  /** Estado del backend y de la base de datos. No requiere sesion. */
  health: () => request('GET', '/health', { retry: false }),

  /** Parametros publicos (centro del mapa, limites de subida...). */
  publicConfig: () => request('GET', '/config', { retry: false }),

  tokens,
};

export default api;
