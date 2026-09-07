/**
 * Rutas de /api/settings  (solo administrador)
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/setting.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate, authorize(ROLES.ADMINISTRADOR));

router.get('/', controller.getAll);
router.put('/', controller.update);

module.exports = router;
