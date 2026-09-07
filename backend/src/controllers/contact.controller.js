/**
 * Controladores de /api/contacts
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const contactService = require('../services/contact.service');

/** GET /api/contacts */
const list = asyncHandler(async (req, res) => {
  const contacts = await contactService.list(req.user);
  return ApiResponse.ok(res, contacts, 'Contactos de confianza');
});

/** POST /api/contacts */
const create = asyncHandler(async (req, res) => {
  const contact = await contactService.create(req.user, req.body);
  return ApiResponse.created(res, contact, 'Contacto agregado');
});

/** DELETE /api/contacts/:id */
const remove = asyncHandler(async (req, res) => {
  await contactService.remove(req.user, req.params.id);
  return ApiResponse.ok(res, null, 'Contacto eliminado');
});

module.exports = { list, create, remove };
