/**
 * Controlador de /api/audit  (solo administrador)
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const auditModel = require('../models/audit.model');
const { getPagination, buildMeta } = require('../utils/pagination');
const { AUDIT_ACTIONS } = require('../config/constants');

/** GET /api/audit */
const list = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);

  const filters = {
    userId: req.query.user ? Number.parseInt(req.query.user, 10) : null,
    action: req.query.action || null,
    entity: req.query.entity || null,
    from: req.query.from || null,
    to: req.query.to || null,
  };

  const { items, total } = await auditModel.list(filters, pagination);
  return ApiResponse.paginated(res, items, buildMeta(pagination, total), 'Registros de auditoria');
});

/** GET /api/audit/actions - valores validos para el filtro del frontend. */
const actions = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, Object.values(AUDIT_ACTIONS), 'Acciones auditables')
);

module.exports = { list, actions };
