/**
 * Controlador de /api/settings  (solo administrador)
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const settingModel = require('../models/setting.model');
const auditModel = require('../models/audit.model');
const { AUDIT_ACTIONS } = require('../config/constants');

/** GET /api/settings */
const getAll = asyncHandler(async (req, res) => {
  const settings = await settingModel.getAll();
  return ApiResponse.ok(res, settings, 'Configuracion del sistema');
});

/**
 * PUT /api/settings
 * Recibe { clave: valor, ... }. Solo se aplican las claves que ya existen: la
 * configuracion es un catalogo cerrado, no un almacen libre.
 */
const update = asyncHandler(async (req, res) => {
  const changes = req.body || {};

  if (Object.keys(changes).length === 0) {
    throw ApiError.badRequest('No se envio ninguna opcion para actualizar');
  }

  const updated = await settingModel.updateMany(changes, req.user.id);

  if (updated.length === 0) {
    throw ApiError.badRequest(
      'Ninguna de las claves enviadas existe en la configuracion del sistema'
    );
  }

  await auditModel.record(
    {
      userId: req.user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'system_settings',
      description: `Configuracion actualizada: ${updated.join(', ')}`,
      metadata: { keys: updated },
    },
    req
  );

  const settings = await settingModel.getAll();
  return ApiResponse.ok(res, settings, `${updated.length} opcion(es) actualizadas`);
});

module.exports = { getAll, update };
