/**
 * Controladores de /api/catalogs
 *
 * Alimentan los <select> del frontend: tipos de emergencia, estados,
 * prioridades, roles y zonas.
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const catalogModel = require('../models/catalog.model');

/** GET /api/catalogs - todos de una vez, para cargar la interfaz. */
const getAll = asyncHandler(async (req, res) => {
  const catalogs = await catalogModel.getAll();
  return ApiResponse.ok(res, catalogs, 'Catalogos obtenidos');
});

const getTypes = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await catalogModel.getTypes(), 'Tipos de emergencia')
);

const getStatuses = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await catalogModel.getStatuses(), 'Estados de emergencia')
);

const getPriorities = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await catalogModel.getPriorities(), 'Prioridades')
);

const getRoles = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await catalogModel.getRoles(), 'Roles del sistema')
);

const getZones = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await catalogModel.getZones(), 'Zonas')
);

module.exports = { getAll, getTypes, getStatuses, getPriorities, getRoles, getZones };
