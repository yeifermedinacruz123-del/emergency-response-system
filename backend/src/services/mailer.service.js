/**
 * Correo saliente, compartido por la recuperacion de contrasena y el aviso a
 * contactos de confianza cuando se activa un SOS.
 *
 * Sin SMTP_HOST en backend/.env el sistema sigue funcionando: el mensaje se
 * escribe en la consola del servidor en vez de enviarse, para poder probar el
 * flujo completo en desarrollo sin depender de una cuenta de correo real.
 */

'use strict';

const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const logger = require('../config/logger');

/** El transportador se crea una sola vez, la primera vez que hace falta. */
let transporter = null;

function getTransporter() {
  if (!config.mail.enabled) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    });
  }

  return transporter;
}

/**
 * Envia un correo, o lo imprime en consola si no hay SMTP configurado.
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
  const client = getTransporter();

  if (!client) {
    logger.info(`[correo simulado, sin SMTP_HOST] Para: ${to} · Asunto: ${subject}`);
    logger.info(text);
    return { sent: false, simulated: true };
  }

  try {
    await client.sendMail({ from: config.mail.fromAddress, to, subject, text, html });
    return { sent: true, simulated: false };
  } catch (error) {
    logger.error(`No se pudo enviar el correo a ${to}: ${error.message}`);
    return { sent: false, simulated: false, error: error.message };
  }
}

module.exports = { sendMail };
