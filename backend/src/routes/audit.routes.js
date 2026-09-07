/**
 * Rutas de /api/audit  (solo administrador)
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/audit.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { pagination, dateRange } = require('../validators/common.validator');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate, authorize(ROLES.ADMINISTRADOR));

router.get('/actions', controller.actions);
router.get('/', pagination(), dateRange(), validate, controller.list);

module.exports = router;
