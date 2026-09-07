/**
 * Contactos de confianza: a quien se avisa por correo cuando el ciudadano
 * activa el SOS. Cada uno administra solo los suyos.
 */

'use strict';

const ApiError = require('../utils/ApiError');
const contactModel = require('../models/trustedContact.model');
const mailerService = require('./mailer.service');
const logger = require('../config/logger');

/** Tope bajo a proposito: son los contactos que se avisan en una emergencia real, no una libreta. */
const MAX_CONTACTS = 3;

async function list(user) {
  return contactModel.listByUser(user.id);
}

async function create(user, data) {
  const total = await contactModel.countByUser(user.id);
  if (total >= MAX_CONTACTS) {
    throw ApiError.badRequest(`Ya tienes ${MAX_CONTACTS} contactos de confianza, el maximo permitido.`);
  }

  return contactModel.create({
    userId: user.id,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
  });
}

async function remove(user, id) {
  const removed = await contactModel.remove(id, user.id);
  if (!removed) throw ApiError.notFound('Ese contacto no existe o no es tuyo');
}

/**
 * Avisa por correo a los contactos de confianza de un ciudadano cuando activa
 * el SOS. Nunca lanza: un correo que falla no debe afectar al SOS ya enviado,
 * que es lo verdaderamente urgente.
 */
async function notifyOnSos(reporter, emergency) {
  try {
    const contacts = await contactModel.listByUser(reporter.id);
    const withEmail = contacts.filter((contact) => contact.email);
    if (withEmail.length === 0) return;

    const mapsLink = emergency.latitude && emergency.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${emergency.latitude},${emergency.longitude}`
      : null;

    await Promise.all(
      withEmail.map((contact) =>
        mailerService.sendMail({
          to: contact.email,
          subject: `${reporter.first_name} ${reporter.last_name} activo una alerta SOS`,
          text:
            `Hola ${contact.full_name},\n\n` +
            `${reporter.first_name} ${reporter.last_name} te tiene como contacto de confianza ` +
            `y acaba de activar una alerta SOS (${emergency.code}) en el Emergency Response System.\n` +
            (mapsLink ? `Ubicacion: ${mapsLink}\n\n` : '\n') +
            `Telefono de ${reporter.first_name}: ${reporter.phone || 'no registrado'}.\n\n` +
            'El centro de control ya fue notificado.',
          html:
            `<p>Hola ${contact.full_name},</p>` +
            `<p><strong>${reporter.first_name} ${reporter.last_name}</strong> te tiene como contacto de confianza ` +
            `y acaba de activar una alerta SOS (<strong>${emergency.code}</strong>) en el Emergency Response System.</p>` +
            (mapsLink ? `<p><a href="${mapsLink}">Ver ubicacion en el mapa</a></p>` : '') +
            `<p>Telefono de ${reporter.first_name}: ${reporter.phone || 'no registrado'}.</p>` +
            '<p>El centro de control ya fue notificado.</p>',
        })
      )
    );
  } catch (error) {
    logger.error(`No se pudo avisar a los contactos de confianza: ${error.message}`);
  }
}

module.exports = { list, create, remove, notifyOnSos };
