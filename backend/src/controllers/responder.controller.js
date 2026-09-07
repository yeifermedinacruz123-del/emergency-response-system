/**
 * Controladores de /api/responders
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const responderService = require('../services/responder.service');

/** GET /api/responders */
const list = asyncHandler(async (req, res) => {
  const { items, meta } = await responderService.list(req.query);
  return ApiResponse.paginated(res, items, meta, 'Personal obtenido');
});

/** GET /api/responders/available */
const available = asyncHandler(async (req, res) => {
  const items = await responderService.findAvailable(req.query);
  return ApiResponse.ok(res, items, 'Unidades disponibles');
});

/** GET /api/responders/catalogs */
const catalogs = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, responderService.getCatalogs(), 'Catalogos de personal');
});

/** GET /api/responders/me */
const getOwnProfile = asyncHandler(async (req, res) => {
  const responder = await responderService.getOwnProfile(req.user);
  return ApiResponse.ok(res, responder, 'Tu ficha de personal');
});

/** PATCH /api/responders/me/location */
const updateOwnLocation = asyncHandler(async (req, res) => {
  const responder = await responderService.updateOwnLocation(
    req.user,
    req.body.latitude,
    req.body.longitude
  );
  return ApiResponse.ok(res, responder, 'Ubicacion actualizada');
});

/** GET /api/responders/:id */
const getById = asyncHandler(async (req, res) => {
  const responder = await responderService.getById(req.params.id);
  return ApiResponse.ok(res, responder, 'Detalle de la unidad');
});

/** POST /api/responders */
const create = asyncHandler(async (req, res) => {
  const responder = await responderService.create(req.body, req.user, req);
  return ApiResponse.created(res, responder, `Unidad ${responder.unit_code} creada`);
});

/** PUT /api/responders/:id */
const update = asyncHandler(async (req, res) => {
  const responder = await responderService.update(req.params.id, req.body, req.user, req);
  return ApiResponse.ok(res, responder, 'Unidad actualizada');
});

/** PATCH /api/responders/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const responder = await responderService.changeStatus(
    req.params.id,
    req.body.status,
    req.user,
    req
  );
  return ApiResponse.ok(res, responder, `Estado cambiado a ${responder.status}`);
});

module.exports = {
  list,
  available,
  catalogs,
  getOwnProfile,
  updateOwnLocation,
  getById,
  create,
  update,
  changeStatus,
};
