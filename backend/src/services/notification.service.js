/**
 * Notificaciones del sistema.
 *
 * Un solo lugar decide QUIEN recibe QUE mensaje. Los servicios de emergencias
 * llaman a estas funciones y no arman textos por su cuenta, asi los mensajes
 * son consistentes en toda la aplicacion.
 *
 * Las funciones aceptan un `client` de transaccion: cuando se crea una
 * emergencia, la notificacion se inserta dentro de la MISMA transaccion, asi
 * que nunca existe una notificacion de algo que al final no se guardo.
 */

'use strict';

const { ROLES, NOTIFICATION_TYPES } = require('../config/constants');
const notificationModel = require('../models/notification.model');
const userModel = require('../models/user.model');
const { getPagination, buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');
const pushService = require('./push.service');
const realtime = require('../sockets/realtime');

/** Roles que atienden el centro de control. */
const CONTROL_ROOM_ROLES = [ROLES.OPERADOR, ROLES.ADMINISTRADOR];

/**
 * Avisa al centro de control de una emergencia nueva.
 * Un SOS se anuncia distinto para que destaque en la bandeja.
 */
async function notifyNewEmergency(emergency, client = null) {
  const recipients = await userModel.findIdsByRoles(CONTROL_ROOM_ROLES);
  if (recipients.length === 0) return [];

  const isSos = emergency.is_sos;

  return notificationModel.createForMany(
    recipients,
    {
      emergencyId: emergency.id,
      type: isSos ? NOTIFICATION_TYPES.SOS : NOTIFICATION_TYPES.EMERGENCIA_NUEVA,
      title: isSos ? 'SOS activado' : 'Nueva emergencia reportada',
      message: isSos
        ? `SOS ${emergency.code}: ${emergency.title}. Requiere atencion inmediata.`
        : `${emergency.code}: ${emergency.title}`,
      icon: isSos ? '🆘' : '🚨',
    },
    client
  );
}

/** Avisa al ciudadano de que su reporte quedo registrado. */
async function notifyReportReceived(emergency, client = null) {
  return notificationModel.create(
    {
      userId: emergency.user_id,
      emergencyId: emergency.id,
      type: NOTIFICATION_TYPES.EMERGENCIA_NUEVA,
      title: 'Reporte recibido',
      message: `Tu reporte ${emergency.code} fue recibido por el centro de control.`,
      icon: '🚨',
    },
    client
  );
}

/**
 * Avisa de una asignacion: al ciudadano que reporto y a cada responsable.
 * @param {Array<{userId:number, unitCode:string}>} responders
 */
async function notifyAssignment(emergency, reporterId, responders = [], client = null) {
  const created = [];

  if (reporterId) {
    const units = responders.map((responder) => responder.unitCode).join(', ');
    created.push(
      await notificationModel.create(
        {
          userId: reporterId,
          emergencyId: emergency.id,
          type: NOTIFICATION_TYPES.PERSONAL_ASIGNADO,
          title: 'Personal asignado',
          message: `Se asigno personal a tu reporte ${emergency.code}${units ? ` (${units})` : ''}.`,
          icon: '🚑',
        },
        client
      )
    );
  }

  const responderUserIds = responders.map((responder) => responder.userId).filter(Boolean);
  if (responderUserIds.length > 0) {
    const rows = await notificationModel.createForMany(
      responderUserIds,
      {
        emergencyId: emergency.id,
        type: NOTIFICATION_TYPES.PERSONAL_ASIGNADO,
        title: 'Nueva emergencia asignada',
        message: `Te asignaron la emergencia ${emergency.code}: ${emergency.title}`,
        icon: '📍',
      },
      client
    );
    created.push(...rows);
  }

  return created;
}

/** Texto de cada estado, para no repetirlo en los servicios. */
const STATUS_MESSAGES = {
  EN_PROCESO: {
    type: NOTIFICATION_TYPES.EMERGENCIA_EN_PROCESO,
    title: 'Emergencia en proceso',
    icon: '🔵',
    message: (code) => `Tu reporte ${code} esta siendo atendido.`,
  },
  RESUELTO: {
    type: NOTIFICATION_TYPES.EMERGENCIA_RESUELTA,
    title: 'Emergencia resuelta',
    icon: '✅',
    message: (code) => `Tu reporte ${code} fue atendido y cerrado.`,
  },
  CANCELADO: {
    type: NOTIFICATION_TYPES.EMERGENCIA_CANCELADA,
    title: 'Emergencia cancelada',
    icon: '⚪',
    message: (code) => `Tu reporte ${code} fue cancelado.`,
  },
};

/** Avisa al ciudadano de un cambio de estado. */
async function notifyStatusChange(emergency, statusCode, client = null) {
  const template = STATUS_MESSAGES[statusCode];
  if (!template) return null;

  return notificationModel.create(
    {
      userId: emergency.reporter_id || emergency.user_id,
      emergencyId: emergency.id,
      type: template.type,
      title: template.title,
      message: template.message(emergency.code),
      icon: template.icon,
    },
    client
  );
}

/* -------------------------------------------------------------------------
 *  Entrega
 * ---------------------------------------------------------------------- */

/**
 * Entrega por los canales en vivo unas notificaciones ya guardadas.
 *
 * Un solo lugar decide COMO llega un aviso a una persona:
 *   1. La bandeja (ya insertada en la base) es la fuente de verdad.
 *   2. Socket.IO, si tiene la aplicacion abierta.
 *   3. Push, si acepto las notificaciones del navegador.
 *
 * Se llama SIEMPRE despues del COMMIT: anunciar algo que aun podria revertirse
 * dejaria al usuario viendo un aviso de una emergencia inexistente.
 *
 * El push va sin await a proposito: es una peticion a un servidor externo y
 * nadie debe esperarla para que su emergencia quede registrada.
 */
function deliver(notifications) {
  const list = (Array.isArray(notifications) ? notifications : [notifications]).filter(Boolean);
  if (list.length === 0) return;

  realtime.notificationsCreated(list);
  pushService.sendForNotifications(list);
}

/* -------------------------------------------------------------------------
 *  Operaciones de la bandeja del usuario
 * ---------------------------------------------------------------------- */

/** Bandeja paginada. */
async function listForUser(userId, query = {}) {
  const pagination = getPagination(query);
  const onlyUnread = query.unread === 'true' || query.unread === true;

  const { items, total } = await notificationModel.listForUser(
    userId,
    { onlyUnread },
    pagination
  );

  return { items, meta: buildMeta(pagination, total) };
}

/** Contador para el badge. */
async function countUnread(userId) {
  return notificationModel.countUnread(userId);
}

/** Marca una notificacion propia como leida. */
async function markAsRead(id, userId) {
  const updated = await notificationModel.markAsRead(id, userId);
  if (!updated) {
    throw ApiError.notFound('La notificacion no existe, no es tuya o ya estaba leida');
  }
  return { id, isRead: true };
}

/** Marca toda la bandeja como leida. */
async function markAllAsRead(userId) {
  const count = await notificationModel.markAllAsRead(userId);
  return { updated: count };
}

module.exports = {
  deliver,
  notifyNewEmergency,
  notifyReportReceived,
  notifyAssignment,
  notifyStatusChange,
  listForUser,
  countUnread,
  markAsRead,
  markAllAsRead,
};
