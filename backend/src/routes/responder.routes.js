/**
 * Rutas de /api/responders
 *
 * Igual que en emergencias, las rutas fijas (/available, /me, /catalogs) van
 * antes que /:id para que Express no las confunda con un identificador.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/responder.controller');
const validator = require('../validators/responder.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { idParam } = require('../validators/common.validator');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate);

/* ---------------------------- Rutas del personal ------------------------ */

router.get('/me', authorize(ROLES.PERSONAL), controller.getOwnProfile);

router.patch(
  '/me/location',
  authorize(ROLES.PERSONAL),
  validator.updateLocation,
  validate,
  controller.updateOwnLocation
);

/* --------------------------- Consulta y catalogos ----------------------- */

router.get('/catalogs', controller.catalogs);

router.get(
  '/',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.listQuery,
  validate,
  controller.list
);

router.get(
  '/available',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.availableQuery,
  validate,
  controller.available
);

router.get(
  '/:id',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  idParam(),
  validate,
  controller.getById
);

/* ------------------------------ Administracion -------------------------- */

router.post('/', authorize(ROLES.ADMINISTRADOR), validator.create, validate, controller.create);

router.put('/:id', authorize(ROLES.ADMINISTRADOR), validator.update, validate, controller.update);

// El personal puede cambiar SU disponibilidad; el servicio comprueba que la
// unidad le pertenezca.
router.patch(
  '/:id/status',
  authorize(ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.changeStatus,
  validate,
  controller.changeStatus
);

module.exports = router;
