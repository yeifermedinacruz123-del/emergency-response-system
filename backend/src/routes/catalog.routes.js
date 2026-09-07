/**
 * Rutas de /api/catalogs
 * Cualquier usuario autenticado puede leerlos: son datos de referencia.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/catalog.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

router.use(authenticate);

router.get('/', controller.getAll);
router.get('/types', controller.getTypes);
router.get('/statuses', controller.getStatuses);
router.get('/priorities', controller.getPriorities);
router.get('/roles', controller.getRoles);
router.get('/zones', controller.getZones);

module.exports = router;
