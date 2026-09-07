/**
 * Rutas de /api/users
 * Todo el modulo es exclusivo del ADMINISTRADOR.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/user.controller');
const validator = require('../validators/user.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { idParam } = require('../validators/common.validator');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(authenticate, authorize(ROLES.ADMINISTRADOR));

router.get('/', validator.listQuery, validate, controller.list);
// Va antes de /:id para que "credentials.xlsx" no se lea como un identificador.
router.get('/credentials.xlsx', controller.downloadCredentials);
router.get('/:id', idParam(), validate, controller.getById);
router.post('/', validator.create, validate, controller.create);
router.put('/:id', validator.update, validate, controller.update);
router.patch('/:id/status', validator.changeStatus, validate, controller.changeStatus);
router.patch('/:id/role', validator.changeRole, validate, controller.changeRole);
router.delete('/:id', idParam(), validate, controller.remove);

module.exports = router;
