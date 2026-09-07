/**
 * Rutas de /api/contacts
 *
 * Los contactos de confianza son del ciudadano: cada quien administra los
 * suyos. Operador y administrador no necesitan verlos ni tocarlos.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/contact.controller');
const validator = require('../validators/contact.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { idParam } = require('../validators/common.validator');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate, authorize(ROLES.CIUDADANO));

router.get('/', controller.list);
router.post('/', validator.create, validate, controller.create);
router.delete('/:id', idParam(), validate, controller.remove);

module.exports = router;
