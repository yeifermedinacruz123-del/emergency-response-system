/**
 * Emisor de eventos en tiempo real.
 *
 * Los servicios NO conocen Socket.IO: llaman a las funciones de este modulo y
 * aqui se decide a que sala va cada evento. Asi la logica de negocio no queda
 * atada al transporte, y si manana el tiempo real cambiara de tecnologia solo
 * habria que reescribir este archivo.
 *
 * Regla importante: los eventos se emiten SIEMPRE despues de que la
 * transaccion haya hecho COMMIT. Si se emitieran dentro, un rollback dejaria a
 * los operadores viendo una emergencia que en la base de datos no existe.
 *
 * Si el servidor de sockets todavia no se inicializo (por ejemplo al ejecutar
 * un script suelto o una prueba), las funciones no fallan: simplemente no hay
 * nadie a quien emitir. Eso mantiene el backend usable sin Socket.IO.
 */

'use strict';

const { SOCKET_EVENTS, SOCKET_ROOMS } = require('../config/constants');
const logger = require('../config/logger');

/** Instancia de Socket.IO. La coloca sockets/index.js al arrancar. */
let io = null;

/** Guarda la instancia para que el resto del modulo pueda emitir. */
function setServer(server) {
  io = server;
}

/** true si hay servidor de sockets activo. */
function isReady() {
  return io !== null;
}

/* =========================================================================
 *  Emisores basicos
 * ====================================================================== */

/** Emite a una sala concreta. */
function emitToRoom(room, event, payload) {
  if (!io) return false;
  io.to(room).emit(event, payload);
  logger.debug(`Socket -> ${room} : ${event}`);
  return true;
}

/** Emite al centro de control (operadores y administradores). */
function emitToControlRoom(event, payload) {
  return emitToRoom(SOCKET_ROOMS.CONTROL_ROOM, event, payload);
}

/** Emite a todo el personal de emergencia conectado. */
function emitToResponders(event, payload) {
  return emitToRoom(SOCKET_ROOMS.RESPONDERS, event, payload);
}

/** Emite a un usuario concreto, en todas sus pestañas y dispositivos. */
function emitToUser(userId, event, payload) {
  return emitToRoom(SOCKET_ROOMS.user(userId), event, payload);
}

/** Emite a quienes tienen abierto el detalle de una emergencia. */
function emitToEmergency(emergencyId, event, payload) {
  return emitToRoom(SOCKET_ROOMS.emergency(emergencyId), event, payload);
}

/* =========================================================================
 *  Eventos del dominio
 *  Cada funcion sabe QUE se manda y A QUIEN. Los servicios solo dicen
 *  "esto acaba de pasar".
 * ====================================================================== */

/**
 * Reduce una emergencia a lo que necesita un marcador o una fila de la tabla.
 * Se envia una version ligera para no mandar el historial y las fotos completas
 * en cada evento: quien necesite el detalle lo pide por la API.
 */
function toEventPayload(emergency) {
  return {
    id: emergency.id,
    code: emergency.code,
    title: emergency.title,
    is_sos: emergency.is_sos,
    reported_at: emergency.reported_at,
    assigned_at: emergency.assigned_at,
    resolved_at: emergency.resolved_at,
    latitude: emergency.latitude,
    longitude: emergency.longitude,
    address: emergency.address,
    zone_name: emergency.zone_name,
    type_code: emergency.type_code,
    type_name: emergency.type_name,
    type_icon: emergency.type_icon,
    type_color: emergency.type_color,
    status_code: emergency.status_code,
    status_name: emergency.status_name,
    status_color: emergency.status_color,
    priority_code: emergency.priority_code,
    priority_name: emergency.priority_name,
    priority_color: emergency.priority_color,
    priority_level: emergency.priority_level,
    reporter_id: emergency.reporter_id,
    reporter_name: emergency.reporter_name,
    reporter_phone: emergency.reporter_phone,
    assignment_count: emergency.assignment_count,
    photo_count: emergency.photo_count,
  };
}

/**
 * Emergencia nueva.
 * Un SOS ademas dispara `sos:activated`, que el dashboard usa para la alerta
 * sonora y el destacado en rojo. Se mandan los dos eventos a proposito: quien
 * solo pinta la tabla escucha `emergency:new` y no necesita distinguir.
 */
function emergencyCreated(emergency) {
  const payload = toEventPayload(emergency);

  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_NEW, payload);
  emitToUser(emergency.reporter_id, SOCKET_EVENTS.EMERGENCY_NEW, payload);

  if (emergency.is_sos) {
    emitToControlRoom(SOCKET_EVENTS.SOS_ACTIVATED, payload);
  }

  statsChanged();
}

/** Cambio de datos (titulo, descripcion, ubicacion). */
function emergencyUpdated(emergency) {
  const payload = toEventPayload(emergency);
  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_UPDATE, payload);
  emitToEmergency(emergency.id, SOCKET_EVENTS.EMERGENCY_UPDATE, payload);
  emitToUser(emergency.reporter_id, SOCKET_EVENTS.EMERGENCY_UPDATE, payload);
}

/**
 * Cambio de estado.
 * Ademas del evento generico se manda `emergency:resolved` al cerrarse, para
 * que la interfaz pueda animar la salida de la fila sin comparar estados.
 */
function emergencyStatusChanged(emergency, previousStatus) {
  const payload = { ...toEventPayload(emergency), previous_status: previousStatus };

  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_STATUS, payload);
  emitToEmergency(emergency.id, SOCKET_EVENTS.EMERGENCY_STATUS, payload);
  emitToUser(emergency.reporter_id, SOCKET_EVENTS.EMERGENCY_STATUS, payload);
  emitToResponders(SOCKET_EVENTS.EMERGENCY_STATUS, payload);

  if (emergency.status_code === 'RESUELTO') {
    emitToControlRoom(SOCKET_EVENTS.EMERGENCY_RESOLVED, payload);
    emitToUser(emergency.reporter_id, SOCKET_EVENTS.EMERGENCY_RESOLVED, payload);
  }

  statsChanged();
}

/** Cambio de prioridad: reutiliza el evento de actualizacion. */
function emergencyPriorityChanged(emergency, previousPriority) {
  const payload = { ...toEventPayload(emergency), previous_priority: previousPriority };
  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_UPDATE, payload);
  emitToEmergency(emergency.id, SOCKET_EVENTS.EMERGENCY_UPDATE, payload);
  statsChanged();
}

/**
 * Personal asignado.
 * @param {Array<{id:number, user_id:number, unit_code:string}>} responders
 */
function emergencyAssigned(emergency, responders = []) {
  const payload = {
    ...toEventPayload(emergency),
    responders: responders.map((responder) => ({
      id: responder.id,
      unit_code: responder.unit_code,
      unit_name: responder.unit_name,
      responder_type: responder.responder_type,
    })),
  };

  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  emitToEmergency(emergency.id, SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  emitToUser(emergency.reporter_id, SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);

  // Cada responsable recibe el aviso en su propio canal.
  responders.forEach((responder) => {
    emitToUser(responder.user_id, SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  });

  statsChanged();
}

/** Se retiro una unidad de la emergencia. */
function emergencyUnassigned(emergency, responder) {
  const payload = {
    ...toEventPayload(emergency),
    removed_responder: responder
      ? { id: responder.responder_id, unit_code: responder.unit_code }
      : null,
  };

  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  emitToEmergency(emergency.id, SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  if (responder && responder.responder_user_id) {
    emitToUser(responder.responder_user_id, SOCKET_EVENTS.EMERGENCY_ASSIGNED, payload);
  }
  statsChanged();
}

/**
 * Posicion GPS de una unidad.
 * Va solo al centro de control: es el unico que pinta las unidades en el mapa,
 * y son eventos muy frecuentes que no conviene difundir a todos.
 */
function responderLocationUpdated(responder) {
  emitToControlRoom(SOCKET_EVENTS.RESPONDER_LOCATION_UPDATE, {
    id: responder.id,
    user_id: responder.user_id,
    unit_code: responder.unit_code,
    unit_name: responder.unit_name,
    responder_type: responder.responder_type,
    status: responder.status,
    full_name: responder.full_name,
    current_latitude: responder.current_latitude,
    current_longitude: responder.current_longitude,
    location_updated_at: responder.location_updated_at,
  });
}

/** Cambio de disponibilidad de una unidad. */
function responderStatusUpdated(responder) {
  emitToControlRoom(SOCKET_EVENTS.RESPONDER_STATUS_UPDATE, {
    id: responder.id,
    user_id: responder.user_id,
    unit_code: responder.unit_code,
    responder_type: responder.responder_type,
    status: responder.status,
    active_assignments: responder.active_assignments,
  });
  statsChanged();
}

/**
 * Mensaje nuevo en el chat de una emergencia.
 *
 * A proposito NO se usa emitToEmergency: esa sala tambien la sigue el
 * ciudadano que reporto (para ver el estado de su reporte), y este chat es
 * solo entre el centro de control y el personal asignado. Se manda a mano a
 * quien de verdad debe verlo.
 */
function emergencyMessageSent(message, assignedUserIds = []) {
  emitToControlRoom(SOCKET_EVENTS.EMERGENCY_MESSAGE, message);
  assignedUserIds.forEach((userId) => emitToUser(userId, SOCKET_EVENTS.EMERGENCY_MESSAGE, message));
}

/**
 * Notificacion nueva para un usuario.
 * @param {Array<object>|object} notifications Filas ya insertadas.
 */
function notificationsCreated(notifications) {
  const list = Array.isArray(notifications) ? notifications : [notifications];

  list.filter(Boolean).forEach((notification) => {
    emitToUser(notification.user_id, SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      icon: notification.icon,
      emergency_id: notification.emergency_id,
      is_read: notification.is_read,
      created_at: notification.created_at,
    });
  });
}

/**
 * Avisa de que los contadores del dashboard cambiaron.
 *
 * No se mandan las cifras: se manda la señal y el cliente vuelve a pedir
 * /api/statistics/dashboard. Recalcular las estadisticas en cada evento seria
 * caro y llegaria desordenado si dos cambios ocurren a la vez; asi el cliente
 * siempre pinta el estado real y consistente.
 */
function statsChanged() {
  emitToControlRoom(SOCKET_EVENTS.STATS_UPDATE, { at: new Date().toISOString() });
}

module.exports = {
  setServer,
  isReady,
  emitToRoom,
  emitToControlRoom,
  emitToResponders,
  emitToUser,
  emitToEmergency,
  emergencyCreated,
  emergencyUpdated,
  emergencyStatusChanged,
  emergencyPriorityChanged,
  emergencyAssigned,
  emergencyUnassigned,
  responderLocationUpdated,
  responderStatusUpdated,
  emergencyMessageSent,
  notificationsCreated,
  statsChanged,
};
