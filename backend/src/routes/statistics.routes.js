/**
 * Rutas de /api/statistics
 * Reservadas al centro de control (operador y administrador).
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/statistics.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate, authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR));

router.get('/', controller.dashboard);
router.get('/dashboard', controller.dashboard);
router.get('/emergencies', controller.emergencies);
router.get('/emergencies/by-day', controller.byDay);
router.get('/emergencies/by-type', controller.byType);
router.get('/emergencies/by-status', controller.byStatus);
router.get('/emergencies/by-priority', controller.byPriority);
router.get('/emergencies/by-zone', controller.byZone);
router.get('/response-time', controller.responseTime);

module.exports = router;
