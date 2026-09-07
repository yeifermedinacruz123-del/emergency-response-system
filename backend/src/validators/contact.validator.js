/**
 * Reglas de validacion de /api/contacts
 */

'use strict';

const { body } = require('express-validator');
const common = require('./common.validator');

/**
 * POST /api/contacts
 * El correo es obligatorio porque es el unico canal que de verdad se avisa
 * hoy (no hay proveedor de SMS). El telefono queda como dato de referencia
 * para el ciudadano, no porque el sistema lo use para notificar.
 */
const create = [
  common.personName('fullName', 'El nombre del contacto'),
  common.email(),
  common.phone(),
];

module.exports = { create };
