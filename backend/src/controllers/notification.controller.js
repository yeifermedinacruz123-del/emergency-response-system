/**
 * Controladores de /api/notifications
 *
 * Todas operan sobre la bandeja del usuario autenticado: nunca se recibe un
 * userId por parametro, se toma de req.user. Asi nadie puede leer ni marcar
 * las notificaciones de otra persona.
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const pushService = require('../services/push.service');
const settingService = require('../services/setting.service');
const subscriptionModel = require('../models/pushSubscription.model');
const ApiError = require('../utils/ApiError');

/** GET /api/notifications */
const list = asyncHandler(async (req, res) => {
  const { items, meta } = await notificationService.listForUser(req.user.id, req.query);
  return ApiResponse.paginated(res, items, meta, 'Notificaciones obtenidas');
});

/** GET /api/notifications/unread-count */
const unreadCount = asyncHandler(async (req, res) => {
  const total = await notificationService.countUnread(req.user.id);
  return ApiResponse.ok(res, { unread: total }, 'Notificaciones sin leer');
});

/** PATCH /api/notifications/:id/read */
const markAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAsRead(req.params.id, req.user.id);
  return ApiResponse.ok(res, result, 'Notificacion marcada como leida');
});

/** PATCH /api/notifications/read-all */
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);
  return ApiResponse.ok(res, result, `${result.updated} notificacion(es) marcadas como leidas`);
});

/* ==========================================================================
   Notificaciones push
   ========================================================================== */

/** GET /api/notifications/push-key - clave publica VAPID para suscribirse. */
const pushKey = asyncHandler(async (req, res) => {
  // Apagado desde Configuracion equivale a no tener claves: no se ofrece.
  const key = (await settingService.isPushEnabled()) ? pushService.getPublicKey() : null;

  return ApiResponse.ok(
    res,
    { enabled: Boolean(key), publicKey: key },
    key ? 'Clave publica de notificaciones' : 'Las notificaciones push no estan configuradas'
  );
});

/**
 * Servicios de push de los navegadores. El endpoint de una suscripcion es una
 * URL a la que ESTE servidor hace un POST cada vez que envia un aviso; si se
 * aceptara cualquiera, un usuario podria registrar una direccion interna
 * (http://localhost:5432, la red del proveedor...) y usar el servidor para
 * atacarla. Solo se admiten los servicios reales, siempre por HTTPS.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge Android, Samsung Internet, Opera
  'android.googleapis.com',
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge en Windows
  'push.apple.com', // Safari
];

function isPushServiceEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * POST /api/notifications/subscribe
 * Recibe la suscripcion que genero el navegador.
 */
const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body || {};

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw ApiError.badRequest(
      'La suscripcion debe incluir endpoint y las claves p256dh y auth que genera el navegador'
    );
  }

  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isPushServiceEndpoint(endpoint)) {
    throw ApiError.badRequest('El endpoint no pertenece a un servicio de notificaciones reconocido');
  }

  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
      || keys.p256dh.length > 200 || keys.auth.length > 100) {
    throw ApiError.badRequest('Las claves de la suscripcion no tienen un formato valido');
  }

  const saved = await subscriptionModel.save({
    userId: req.user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  });

  return ApiResponse.created(res, { id: saved.id }, 'Notificaciones activadas en este dispositivo');
});

/**
 * DELETE /api/notifications/subscribe
 * Da de baja este dispositivo.
 */
const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) throw ApiError.badRequest('Falta el endpoint de la suscripcion');

  // Solo las suscripciones propias: nadie da de baja el telefono de otro.
  const removed = await subscriptionModel.removeByEndpoint(endpoint, req.user.id);

  return ApiResponse.ok(
    res,
    { removed },
    removed ? 'Notificaciones desactivadas en este dispositivo' : 'Ese dispositivo no estaba suscrito'
  );
});

/** POST /api/notifications/test - envio de prueba al propio usuario. */
const sendTest = asyncHandler(async (req, res) => {
  const result = await pushService.sendTest(req.user.id);
  return ApiResponse.ok(res, result, result.message);
});

module.exports = {
  list,
  unreadCount,
  markAsRead,
  markAllAsRead,
  pushKey,
  subscribe,
  unsubscribe,
  sendTest,
};
