/**
 * config.js - Configuracion global del frontend.
 *
 * Modulo ES6. Se importa con:
 *   import { CONFIG } from './core/config.js';
 *
 * Aqui NO hay secretos: solo parametros publicos de la interfaz.
 */

/** URL base de la API. Vacia = mismo origen que sirve la pagina. */
const API_ORIGIN = '';

export const CONFIG = Object.freeze({
  appName: 'Emergency Response System',
  appShortName: 'ERS',
  version: '1.0.0',

  api: {
    baseUrl: `${API_ORIGIN}/api`,
    timeoutMs: 15000,
  },

  socket: {
    url: API_ORIGIN || window.location.origin,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  },

  /** Claves de localStorage / sessionStorage. */
  storage: Object.freeze({
    accessToken: 'ers.accessToken',
    refreshToken: 'ers.refreshToken',
    user: 'ers.user',
    theme: 'ers.theme',
    sidebarCollapsed: 'ers.sidebarCollapsed',
  }),

  /** Mapa centrado en Villavicencio, Meta. */
  map: Object.freeze({
    center: [4.142, -73.6266],
    zoom: 13,
    minZoom: 11,
    maxZoom: 18,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    city: 'Villavicencio',
    department: 'Meta',
  }),

  pagination: Object.freeze({
    defaultLimit: 20,
    options: [10, 20, 50, 100],
  }),

  uploads: Object.freeze({
    maxFiles: 5,
    maxFileSizeMB: 5,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  }),

  /** Rutas de la aplicacion, en un solo lugar para evitar enlaces rotos. */
  routes: Object.freeze({
    home: '/index.html',
    login: '/login.html',
    register: '/register.html',
    forgotPassword: '/forgot-password.html',
    resetPassword: '/reset-password.html',
    dashboard: '/pages/dashboard.html',
    emergencies: '/pages/emergencies.html',
    emergencyDetail: '/pages/emergency-detail.html',
    map: '/pages/map.html',
    users: '/pages/users.html',
    responders: '/pages/responders.html',
    statistics: '/pages/statistics.html',
    notifications: '/pages/notifications.html',
    audit: '/pages/audit.html',
    settings: '/pages/settings.html',
    mobileHome: '/app/index.html',
    mobileReport: '/app/report.html',
    mobileMyEmergencies: '/app/my-emergencies.html',
    mobileNotifications: '/app/notifications.html',
    mobileContacts: '/app/contacts.html',
  }),
});

/**
 * Atajo a las rutas. Se exporta aparte para poder escribir ROUTES.dashboard
 * en lugar de CONFIG.routes.dashboard en cada pagina.
 */
export const ROUTES = CONFIG.routes;

/** Roles del sistema. Deben coincidir con backend/src/config/constants.js */
export const ROLES = Object.freeze({
  CIUDADANO: 'CIUDADANO',
  PERSONAL: 'PERSONAL',
  OPERADOR: 'OPERADOR',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

/** Etiquetas, colores e iconos de los estados de una emergencia. */
export const STATUS_META = Object.freeze({
  PENDIENTE:  { label: 'Pendiente',  color: 'var(--status-pendiente)', bg: 'var(--status-pendiente-bg)', icon: '●' },
  EN_PROCESO: { label: 'En proceso', color: 'var(--status-proceso)',   bg: 'var(--status-proceso-bg)',   icon: '◐' },
  RESUELTO:   { label: 'Resuelto',   color: 'var(--status-resuelto)',  bg: 'var(--status-resuelto-bg)',  icon: '✓' },
  CANCELADO:  { label: 'Cancelado',  color: 'var(--status-cancelado)', bg: 'var(--status-cancelado-bg)', icon: '✕' },
});

/** Etiquetas y colores de las prioridades. */
export const PRIORITY_META = Object.freeze({
  BAJA:    { label: 'Baja',    color: 'var(--priority-baja)',    bg: 'var(--priority-baja-bg)',    weight: 1 },
  MEDIA:   { label: 'Media',   color: 'var(--priority-media)',   bg: 'var(--priority-media-bg)',   weight: 2 },
  ALTA:    { label: 'Alta',    color: 'var(--priority-alta)',    bg: 'var(--priority-alta-bg)',    weight: 3 },
  CRITICA: { label: 'Critica', color: 'var(--priority-critica)', bg: 'var(--priority-critica-bg)', weight: 4 },
});

/** Etiquetas, iconos y colores de los tipos de emergencia. */
export const TYPE_META = Object.freeze({
  MEDICA:           { label: 'Emergencia medica',   icon: '\u{1F691}', color: 'var(--type-medica)' },
  TRANSITO:         { label: 'Accidente de transito', icon: '\u{1F697}', color: 'var(--type-transito)' },
  INCENDIO:         { label: 'Incendio',            icon: '\u{1F525}', color: 'var(--type-incendio)' },
  SEGURIDAD:        { label: 'Seguridad',           icon: '\u{1F693}', color: 'var(--type-seguridad)' },
  INUNDACION:       { label: 'Inundacion',          icon: '\u{1F30A}', color: 'var(--type-inundacion)' },
  DESASTRE_NATURAL: { label: 'Desastre natural',    icon: '\u{1F32A}', color: 'var(--type-desastre)' },
  OTRA:             { label: 'Otra emergencia',     icon: '⚠',    color: 'var(--type-otra)' },
});

/** Tipos y estados del personal de emergencia. */
export const RESPONDER_META = Object.freeze({
  types: {
    PARAMEDICO:  { label: 'Paramedico',  icon: '\u{1F691}' },
    BOMBERO:     { label: 'Bombero',     icon: '\u{1F692}' },
    POLICIA:     { label: 'Policia',     icon: '\u{1F693}' },
    RESCATISTA:  { label: 'Rescatista',  icon: '\u{1F9BA}' },
  },
  statuses: {
    DISPONIBLE:        { label: 'Disponible',        color: 'var(--success)' },
    OCUPADO:           { label: 'Ocupado',           color: 'var(--warning)' },
    FUERA_DE_SERVICIO: { label: 'Fuera de servicio', color: 'var(--text-muted)' },
  },
});

/** Eventos de Socket.IO. Iguales a los del backend. */
export const SOCKET_EVENTS = Object.freeze({
  EMERGENCY_NEW: 'emergency:new',
  EMERGENCY_UPDATE: 'emergency:update',
  EMERGENCY_ASSIGNED: 'emergency:assigned',
  EMERGENCY_STATUS: 'emergency:status',
  EMERGENCY_RESOLVED: 'emergency:resolved',
  SOS_ACTIVATED: 'sos:activated',
  RESPONDER_LOCATION_UPDATE: 'responder:location:update',
  RESPONDER_STATUS_UPDATE: 'responder:status:update',
  NOTIFICATION_NEW: 'notification:new',
  STATS_UPDATE: 'stats:update',
  EMERGENCY_MESSAGE: 'emergency:message',
});

export default CONFIG;
