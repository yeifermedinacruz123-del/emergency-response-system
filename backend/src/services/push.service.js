/**
 * push.service.js - Envio de notificaciones push (Web Push / VAPID).
 *
 * Por que Web Push y no el SDK de Firebase:
 *   Web Push es el estandar del navegador. En Android, Chrome ya entrega estos
 *   mensajes a traves de la infraestructura de Google (la misma que hay detras
 *   de FCM) sin que el backend tenga que registrarse en ningun servicio ni
 *   guardar credenciales de terceros. Las claves VAPID las genera este mismo
 *   proyecto. Resultado: push real, funcionando, sin cuentas externas.
 *
 * Reglas de diseño:
 *   - El push NUNCA bloquea la operacion que lo origino. Si falla el envio, la
 *     emergencia ya se creo y la notificacion ya esta en la bandeja: el push
 *     es un canal adicional, no la fuente de verdad.
 *   - Una suscripcion que el navegador declara muerta (404 o 410) se borra al
 *     instante: reintentarla no serviria nunca.
 */

'use strict';

const webpush = require('web-push');

const { config } = require('../config/env');
const logger = require('../config/logger');
const subscriptionModel = require('../models/pushSubscription.model');

/** true cuando hay claves y el envio esta habilitado. */
let ready = false;

/**
 * Configura web-push con las claves VAPID.
 * Se llama una vez al arrancar el servidor.
 */
function init() {
  if (!config.push.enabled) {
    logger.info('Notificaciones push deshabilitadas (PUSH_ENABLED=false)');
    return false;
  }

  if (!config.push.publicKey || !config.push.privateKey) {
    logger.warn(
      'PUSH_ENABLED=true pero faltan las claves VAPID. Generalas con:\n' +
        '  node -e "console.log(require(\'web-push\').generateVAPIDKeys())"'
    );
    return false;
  }

  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  ready = true;

  logger.info('Notificaciones push listas (Web Push / VAPID)');
  return true;
}

/** La clave publica que necesita el navegador para suscribirse. */
function getPublicKey() {
  return config.push.enabled ? config.push.publicKey : null;
}

function isReady() {
  return ready;
}

/**
 * Envia a UNA suscripcion.
 * @returns {Promise<boolean>} true si se entrego.
 */
async function sendToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: payload.urgent ? 3600 : 86400 }
    );

    await subscriptionModel.markUsed(subscription.id);
    return true;
  } catch (error) {
    /*
     * 404 / 410 significan que la suscripcion ya no existe: el usuario
     * desinstalo la app o revoco el permiso. Se borra sin contemplaciones.
     */
    if (error.statusCode === 404 || error.statusCode === 410) {
      await subscriptionModel.removeById(subscription.id);
      logger.debug(`Suscripcion push ${subscription.id} caducada: eliminada`);
      return false;
    }

    await subscriptionModel.markFailure(subscription.id);
    logger.warn(`Fallo al enviar push a la suscripcion ${subscription.id}: ${error.message}`);
    return false;
  }
}

/**
 * Envia a todos los dispositivos de uno o varios usuarios.
 *
 * @param {number|number[]} userIds
 * @param {object} payload { title, body, url, tag, urgent }
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendToUsers(userIds, payload) {
  if (!ready) return { sent: 0, failed: 0 };

  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return { sent: 0, failed: 0 };

  const subscriptions = await subscriptionModel.findByUsers(ids);
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  // En paralelo: son peticiones a servidores externos y no dependen entre si.
  const results = await Promise.all(
    subscriptions.map((subscription) => sendToSubscription(subscription, payload))
  );

  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
}

/**
 * Envia el push que corresponde a una notificacion ya guardada en la bandeja.
 *
 * Se llama SIN await desde el servicio de notificaciones a proposito: el
 * usuario no debe esperar a que un servidor externo responda para que su
 * emergencia quede registrada.
 *
 * @param {object|object[]} notifications Filas de la tabla notifications.
 */
function sendForNotifications(notifications) {
  if (!ready) return;

  const list = (Array.isArray(notifications) ? notifications : [notifications]).filter(Boolean);
  if (list.length === 0) return;

  // Un SOS interrumpe: vibra distinto y no se descarta solo.
  const URGENT_TYPES = new Set(['SOS', 'EMERGENCIA_NUEVA']);

  list.forEach((notification) => {
    const payload = {
      title: `${notification.icon || '🚨'} ${notification.title}`,
      body: notification.message,
      tag: `ers-${notification.type}-${notification.emergency_id || notification.id}`,
      url: notification.emergency_id
        ? `/app/emergency.html?id=${notification.emergency_id}`
        : '/app/notifications.html',
      urgent: URGENT_TYPES.has(notification.type),
    };

    sendToUsers(notification.user_id, payload).catch((error) => {
      logger.warn(`Error inesperado enviando push: ${error.message}`);
    });
  });
}

/** Envio de prueba, para comprobar la configuracion desde la interfaz. */
async function sendTest(userId) {
  if (!ready) {
    return { sent: 0, failed: 0, message: 'Las notificaciones push no estan configuradas' };
  }

  const result = await sendToUsers(userId, {
    title: '🔔 Notificaciones activadas',
    body: 'Asi se veran los avisos del Emergency Response System.',
    tag: 'ers-test',
    url: '/app/index.html',
  });

  return {
    ...result,
    message: result.sent > 0
      ? 'Notificacion de prueba enviada'
      : 'No hay dispositivos suscritos en esta cuenta',
  };
}

module.exports = { init, isReady, getPublicKey, sendToUsers, sendForNotifications, sendTest };
