/**
 * Correo saliente, compartido por la recuperacion de contrasena y el aviso a
 * contactos de confianza cuando se activa un SOS.
 *
 * Tres formas de enviarlo (MAIL_PROVIDER en backend/.env):
 *   smtp    nodemailer contra un servidor SMTP.
 *   brevo   API HTTP de Brevo.
 *   resend  API HTTP de Resend.
 *
 * Sin proveedor configurado el sistema sigue funcionando: en desarrollo el
 * mensaje se escribe en la consola del servidor para poder probar el flujo
 * completo sin una cuenta de correo real.
 */

'use strict';

const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const logger = require('../config/logger');

/** Tiempo maximo de una llamada a la API de correo. */
const API_TIMEOUT_MS = 10000;

const PROVIDERS = ['smtp', 'brevo', 'resend'];

/** Escapa texto para insertarlo en la version HTML de un correo. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Separa "Nombre <correo@dominio>" en sus dos partes. Brevo las pide por
 * separado; SMTP y Resend aceptan la cadena completa.
 */
function parseAddress(address) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address || '');
  if (match) return { name: match[1].replace(/^"|"$/g, ''), email: match[2] };
  return { name: '', email: String(address || '').trim() };
}

/** Proveedor efectivo, o null si no hay ninguno utilizable. */
function activeProvider() {
  const { provider, host, apiKey } = config.mail;
  if (!PROVIDERS.includes(provider)) return null;
  if (provider === 'smtp') return host ? 'smtp' : null;
  return apiKey ? provider : null;
}

/** true si el correo sale de verdad (no simulado en consola). */
function isConfigured() {
  return activeProvider() !== null;
}

/* --------------------------------------------------------------- SMTP */

/** El transportador se crea una sola vez, la primera vez que hace falta. */
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,

      /*
       * Sin estos limites, nodemailer hereda el plazo del sistema operativo:
       * si los paquetes al puerto SMTP se descartan en silencio (muchos
       * alojamientos bloquean el correo saliente para evitar el spam), la
       * llamada se queda esperando unos DOS MINUTOS antes de rendirse.
       * Diez segundos bastan para un servidor que responde, y convierten un
       * bloqueo de red en un error registrado en vez de una peticion colgada.
       */
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  return transporter;
}

async function sendWithSmtp({ to, subject, text, html }) {
  await getTransporter().sendMail({ from: config.mail.fromAddress, to, subject, text, html });
}

/* ----------------------------------------------------------- API HTTP */

/** POST JSON con plazo maximo; lanza con el mensaje del proveedor si falla. */
async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`.trim());
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`sin respuesta en ${API_TIMEOUT_MS / 1000} s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendWithBrevo({ to, subject, text, html }) {
  const sender = parseAddress(config.mail.fromAddress);
  await postJson(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': config.mail.apiKey },
    {
      sender: sender.name ? sender : { email: sender.email },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html || `<pre>${escapeHtml(text)}</pre>`,
    }
  );
}

async function sendWithResend({ to, subject, text, html }) {
  await postJson(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${config.mail.apiKey}` },
    { from: config.mail.fromAddress, to: [to], subject, text, html }
  );
}

const SENDERS = { smtp: sendWithSmtp, brevo: sendWithBrevo, resend: sendWithResend };

/**
 * Envia un correo, o lo imprime en consola si no hay proveedor configurado.
 * Nunca lanza: un correo que falla no debe tumbar la peticion que lo pidio
 * (por ejemplo, activar un SOS no debe fallar porque un contacto tenga un
 * correo mal escrito).
 *
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @param {string} [options.html]
 */
async function sendMail({ to, subject, text, html }) {
  /*
   * Todo va dentro del try, incluida la eleccion del proveedor: quien llama
   * puede no esperar esta promesa (la recuperacion de contrasena y el aviso
   * de SOS no lo hacen), y una promesa rechazada sin capturar termina el
   * proceso en Node. Esta funcion informa del fallo con su valor de retorno,
   * nunca lanzando.
   */
  try {
    const provider = activeProvider();

    if (!provider) {
      // En produccion nunca se escriben cuerpos de correo en los logs: un
      // enlace de restablecimiento contiene un token de un solo uso.
      if (config.isProduction) {
        logger.error('Correo no configurado; se omite el envio en produccion', { subject });
        return { sent: false, simulated: false, unavailable: true };
      }

      logger.info(`[correo simulado, sin MAIL_PROVIDER] Para: ${to} · Asunto: ${subject}`);
      logger.info(text);
      return { sent: false, simulated: true };
    }

    await SENDERS[provider]({ to, subject, text, html });
    logger.info(`Correo enviado por ${provider} · Asunto: ${subject}`);
    return { sent: true, simulated: false, provider };
  } catch (error) {
    logger.error(`No se pudo enviar el correo a ${to}: ${error.message}`);
    return { sent: false, simulated: false, error: error.message };
  }
}

module.exports = { sendMail, escapeHtml, isConfigured, parseAddress };
