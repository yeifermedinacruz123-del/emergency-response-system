/**
 * Constantes de dominio compartidas por todo el backend.
 *
 * Se centralizan aqui para que los codigos ("PENDIENTE", "CRITICA", ...) nunca
 * se escriban sueltos dentro de la logica: si un codigo cambia, se cambia en un
 * solo lugar y el resto del sistema sigue funcionando.
 */

'use strict';

/** Roles del sistema. Coinciden con la columna roles.code de PostgreSQL. */
const ROLES = Object.freeze({
  CIUDADANO: 'CIUDADANO',
  PERSONAL: 'PERSONAL',
  OPERADOR: 'OPERADOR',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

/** Estados posibles de una emergencia. */
const EMERGENCY_STATUS = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_PROCESO: 'EN_PROCESO',
  RESUELTO: 'RESUELTO',
  CANCELADO: 'CANCELADO',
});

/** Estados finales: una emergencia en estos estados ya no cambia. */
const FINAL_STATUSES = Object.freeze([
  EMERGENCY_STATUS.RESUELTO,
  EMERGENCY_STATUS.CANCELADO,
]);

/**
 * Transiciones permitidas entre estados (regla de negocio RN-03 a RN-05).
 * clave = estado actual, valor = estados a los que se puede pasar.
 */
const STATUS_TRANSITIONS = Object.freeze({
  PENDIENTE: [EMERGENCY_STATUS.EN_PROCESO, EMERGENCY_STATUS.CANCELADO],
  EN_PROCESO: [EMERGENCY_STATUS.RESUELTO, EMERGENCY_STATUS.CANCELADO],
  RESUELTO: [],
  CANCELADO: [],
});

/** Niveles de prioridad, de menor a mayor urgencia. */
const PRIORITIES = Object.freeze({
  BAJA: 'BAJA',
  MEDIA: 'MEDIA',
  ALTA: 'ALTA',
  CRITICA: 'CRITICA',
});

/** Tipos de emergencia soportados. */
const EMERGENCY_TYPES = Object.freeze({
  MEDICA: 'MEDICA',
  TRANSITO: 'TRANSITO',
  INCENDIO: 'INCENDIO',
  SEGURIDAD: 'SEGURIDAD',
  INUNDACION: 'INUNDACION',
  DESASTRE_NATURAL: 'DESASTRE_NATURAL',
  OTRA: 'OTRA',
});

/** Tipos de personal de emergencia. */
const RESPONDER_TYPES = Object.freeze({
  PARAMEDICO: 'PARAMEDICO',
  BOMBERO: 'BOMBERO',
  POLICIA: 'POLICIA',
  RESCATISTA: 'RESCATISTA',
});

/** Disponibilidad del personal. */
const RESPONDER_STATUS = Object.freeze({
  DISPONIBLE: 'DISPONIBLE',
  OCUPADO: 'OCUPADO',
  FUERA_DE_SERVICIO: 'FUERA_DE_SERVICIO',
});

/** Estados de una asignacion concreta (emergencia + unidad). */
const ASSIGNMENT_STATUS = Object.freeze({
  ASIGNADO: 'ASIGNADO',
  EN_CAMINO: 'EN_CAMINO',
  EN_SITIO: 'EN_SITIO',
  COMPLETADO: 'COMPLETADO',
  CANCELADO: 'CANCELADO',
});

/** Acciones que se registran en emergency_history. */
const HISTORY_ACTIONS = Object.freeze({
  CREADA: 'CREADA',
  ASIGNADA: 'ASIGNADA',
  ASIGNACION_RETIRADA: 'ASIGNACION_RETIRADA',
  ESTADO_CAMBIADO: 'ESTADO_CAMBIADO',
  PRIORIDAD_CAMBIADA: 'PRIORIDAD_CAMBIADA',
  COMENTARIO: 'COMENTARIO',
  FOTO_AGREGADA: 'FOTO_AGREGADA',
  RESUELTA: 'RESUELTA',
  CANCELADA: 'CANCELADA',
});

/** Eventos de Socket.IO. El cliente usa exactamente estos mismos nombres. */
const SOCKET_EVENTS = Object.freeze({
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

/** Salas de Socket.IO. */
const SOCKET_ROOMS = Object.freeze({
  CONTROL_ROOM: 'control-room',
  RESPONDERS: 'responders',
  user: (userId) => `user:${userId}`,
  emergency: (emergencyId) => `emergency:${emergencyId}`,
});

/** Tipos de notificacion interna. */
const NOTIFICATION_TYPES = Object.freeze({
  EMERGENCIA_NUEVA: 'EMERGENCIA_NUEVA',
  SOS: 'SOS',
  PERSONAL_ASIGNADO: 'PERSONAL_ASIGNADO',
  PERSONAL_EN_CAMINO: 'PERSONAL_EN_CAMINO',
  EMERGENCIA_EN_PROCESO: 'EMERGENCIA_EN_PROCESO',
  EMERGENCIA_RESUELTA: 'EMERGENCIA_RESUELTA',
  EMERGENCIA_CANCELADA: 'EMERGENCIA_CANCELADA',
  SISTEMA: 'SISTEMA',
});

/** Acciones registradas en audit_logs. */
const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGOUT: 'LOGOUT',
  CREAR: 'CREAR',
  ACTUALIZAR: 'ACTUALIZAR',
  ELIMINAR: 'ELIMINAR',
  CAMBIO_ESTADO: 'CAMBIO_ESTADO',
  CAMBIO_ROL: 'CAMBIO_ROL',
  ASIGNAR: 'ASIGNAR',
});

/** Valores por defecto de la paginacion de los listados. */
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

module.exports = {
  ROLES,
  EMERGENCY_STATUS,
  FINAL_STATUSES,
  STATUS_TRANSITIONS,
  PRIORITIES,
  EMERGENCY_TYPES,
  RESPONDER_TYPES,
  RESPONDER_STATUS,
  ASSIGNMENT_STATUS,
  HISTORY_ACTIONS,
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  PAGINATION,
};
