/**
 * Rutas de estado y configuracion publica.
 * No requieren autenticacion.
 */

'use strict';

const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

router.get('/health', healthController.health);
router.get('/config', healthController.publicConfig);

module.exports = router;
