/**
 * push.js - Notificaciones push en el navegador (Web Push).
 *
 * Flujo completo:
 *   1. Se pide al backend la clave publica VAPID.
 *   2. Se pide permiso al usuario.
 *   3. El navegador crea una suscripcion con esa clave.
 *   4. Se envia la suscripcion al backend, que la guarda.
 *
 * Requisitos que no dependen de este codigo: hace falta un service worker
 * registrado y un contexto seguro (HTTPS o localhost). Si algo falta, cada
 * funcion lo dice con un mensaje concreto en lugar de fallar en silencio.
 */

import { api } from './api.js';

/**
 * Convierte la clave publica de base64url a Uint8Array.
 * Es el formato que exige pushManager.subscribe y no hay conversion directa:
 * hay que reponer el relleno "=" y cambiar los caracteres propios de base64url.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);

  return output;
}

/** Comprueba si el navegador puede recibir notificaciones push. */
export function isSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Estado actual de las notificaciones en este dispositivo.
 * @returns {Promise<{supported: boolean, permission: string, subscribed: boolean, reason?: string}>}
 */
export async function getStatus() {
  if (!isSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      reason: window.isSecureContext
        ? 'Este navegador no admite notificaciones push.'
        : 'Las notificaciones necesitan HTTPS o localhost.',
    };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: false,
      reason: 'El service worker todavia no esta registrado.',
    };
  }

  const subscription = await registration.pushManager.getSubscription();

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

/**
 * Activa las notificaciones en este dispositivo.
 *
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function subscribe() {
  if (!isSupported()) {
    return { ok: false, message: 'Este navegador no admite notificaciones push.' };
  }

  // 1. Clave publica del servidor.
  let config;
  try {
    config = await api.get('/notifications/push-key');
  } catch {
    return { ok: false, message: 'No se pudo contactar con el servidor.' };
  }

  if (!config.enabled || !config.publicKey) {
    return { ok: false, message: 'El servidor no tiene las notificaciones push configuradas.' };
  }

  // 2. Permiso del usuario.
  //    Si ya lo denego antes, el navegador NO vuelve a preguntar: hay que
  //    decirselo, porque si no parece que el boton no hace nada.
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      message: 'Bloqueaste las notificaciones. Actívalas en los ajustes del sitio en tu navegador.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'No se concedio el permiso de notificaciones.' };
  }

  // 3. Suscripcion en el navegador.
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        // Obligatorio en Chrome: no se permiten notificaciones silenciosas.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    } catch (error) {
      return { ok: false, message: `El navegador rechazo la suscripcion: ${error.message}` };
    }
  }

  // 4. Registro en el servidor.
  try {
    await api.post('/notifications/subscribe', subscription.toJSON());
    return { ok: true, message: 'Notificaciones activadas en este dispositivo.' };
  } catch (error) {
    return { ok: false, message: error.message || 'No se pudo guardar la suscripcion.' };
  }
}

/** Desactiva las notificaciones en este dispositivo. */
export async function unsubscribe() {
  if (!isSupported()) return { ok: false, message: 'No admitido en este navegador.' };

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return { ok: false, message: 'No hay service worker registrado.' };

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true, message: 'Este dispositivo no estaba suscrito.' };

  const { endpoint } = subscription;

  // Primero el servidor: si se cancelara antes en el navegador y fallara la
  // peticion, quedaria una suscripcion muerta en la base de datos.
  try {
    await api.delete('/notifications/subscribe', { endpoint });
  } catch {
    // Aun asi se cancela localmente: el usuario pidio dejar de recibirlas.
  }

  await subscription.unsubscribe();
  return { ok: true, message: 'Notificaciones desactivadas en este dispositivo.' };
}

/** Pide al servidor un envio de prueba. */
export async function sendTest() {
  try {
    const result = await api.post('/notifications/test');
    return { ok: result.sent > 0, message: result.message };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export default { isSupported, getStatus, subscribe, unsubscribe, sendTest };
