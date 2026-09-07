/**
 * utils.js - Funciones de apoyo reutilizables en todo el frontend.
 * Modulo ES6 sin dependencias externas.
 */

/* ==========================================================================
   Seleccion de elementos
   ========================================================================== */

/** Atajo de document.querySelector. */
export const $ = (selector, scope = document) => scope.querySelector(selector);

/** Atajo de querySelectorAll que devuelve un arreglo real. */
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/**
 * Crea un elemento con atributos e hijos.
 * @param {string} tag
 * @param {object} attrs  { class, id, dataset, onclick, ... }
 * @param {Array|string} children
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') node.className = value;
    // "text" escribe contenido de texto, nunca HTML: es la forma segura de
    // insertar datos escritos por un usuario sin arriesgar un XSS.
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  });

  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return node;
}

/* ==========================================================================
   Seguridad
   ========================================================================== */

/**
 * Escapa texto antes de insertarlo con innerHTML.
 * Evita XSS cuando se muestran datos escritos por los usuarios
 * (descripciones de emergencias, nombres, comentarios).
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   Fechas y tiempos
   ========================================================================== */

const LOCALE = 'es-CO';
const TIMEZONE = 'America/Bogota';

/** 01/09/2026, 10:35 a. m. */
export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 01/09/2026 */
export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** 10:35 a. m. */
export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "hace 5 minutos", "hace 2 horas", "ayer"... */
export function timeAgo(value) {
  if (!value) return '—';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);

  if (seconds < 10) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds} segundos`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} dias`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;

  return formatDate(value);
}

/** Convierte minutos a "1 h 25 min". Se usa en el tiempo de respuesta. */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/* ==========================================================================
   Numeros y texto
   ========================================================================== */

export function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  return Number(value).toLocaleString(LOCALE);
}

/** Corta un texto y agrega puntos suspensivos. */
export function truncate(text, max = 80) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** "yeifer medina" -> "Yeifer Medina" */
export function titleCase(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Iniciales para los avatares: "Yeifer Medina" -> "YM" */
export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/* ==========================================================================
   Geografia
   ========================================================================== */

/**
 * Distancia en kilometros entre dos puntos (formula del semiverseno).
 * Se usa para ordenar el personal disponible por cercania.
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "4.1420, -73.6266" */
export function formatCoords(lat, lng, decimals = 5) {
  if (lat === null || lng === null || lat === undefined || lng === undefined) return '—';
  return `${Number(lat).toFixed(decimals)}, ${Number(lng).toFixed(decimals)}`;
}

/* ==========================================================================
   Control de flujo
   ========================================================================== */

/** Ejecuta la funcion solo cuando el usuario deja de escribir. */
export function debounce(fn, delay = 350) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Limita la frecuencia de ejecucion (scroll, mousemove, GPS). */
export function throttle(fn, interval = 500) {
  let lastRun = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastRun >= interval) {
      lastRun = now;
      fn.apply(this, args);
    }
  };
}

/** Pausa asincrona. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ==========================================================================
   URL y almacenamiento
   ========================================================================== */

/** Lee un parametro de la URL: getParam('id') */
export function getParam(name, fallback = null) {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

/** Construye "?a=1&b=2" ignorando valores vacios. */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** localStorage seguro: nunca lanza excepcion. */
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

/* ==========================================================================
   Validaciones de formularios
   ========================================================================== */

export const validators = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim()),
  phone: (value) => /^[0-9+\s()-]{7,20}$/.test(String(value).trim()),
  document: (value) => /^[0-9]{6,15}$/.test(String(value).trim()),
  /** Minimo 8 caracteres, al menos una letra y un numero. */
  password: (value) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value)),
  required: (value) => value !== null && value !== undefined && String(value).trim() !== '',
  latitude: (value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 90,
  longitude: (value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 180,
};
