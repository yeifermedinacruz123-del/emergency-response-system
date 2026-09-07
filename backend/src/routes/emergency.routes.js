/**
 * Rutas de /api/emergencies
 *
 * IMPORTANTE: el orden importa. Las rutas fijas (/mine, /assigned, /map) van
 * ANTES que /:id; si no, Express interpretaria "mine" como un id y la ruta
 * nunca se alcanzaria.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/emergency.controller');
const validator = require('../validators/emergency.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { sosLimiter } = require('../middleware/rateLimit.middleware');
const { uploadEmergencyPhotos, uploadEmergencyReport } = require('../middleware/upload.middleware');
const { idParam } = require('../validators/common.validator');
const { ROLES } = require('../config/constants');

const router = Router();

// Todas las rutas de emergencias requieren sesion.
router.use(authenticate);

/* ------------------------- Rutas fijas (antes de /:id) ------------------ */

router.get(
  '/',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.listQuery,
  validate,
  controller.list
);

router.get(
  '/mine',
  authorize(ROLES.CIUDADANO, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  controller.listMine
);

router.get('/assigned', authorize(ROLES.PERSONAL), controller.listAssigned);

router.get('/map', authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR), controller.map);

/* ----------------------------- Creacion -------------------------------- */

router.post(
  '/',
  authorize(ROLES.CIUDADANO, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  uploadEmergencyReport, // multipart/form-data: debe ir antes de la validacion
  validator.create,
  validate,
  controller.create
);

// El SOS tiene su propio limitador: no puede quedar bloqueado por el general,
// pero tampoco debe permitir spam.
router.post(
  '/sos',
  sosLimiter,
  authorize(ROLES.CIUDADANO, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.sos,
  validate,
  controller.createSos
);

/* --------------------------- Rutas con /:id ---------------------------- */

router.get('/:id', idParam(), validate, controller.getById);
router.get('/:id/history', idParam(), validate, controller.getHistory);

router.put(
  '/:id',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.update,
  validate,
  controller.update
);

router.patch(
  '/:id/status',
  authorize(ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.changeStatus,
  validate,
  controller.changeStatus
);

router.patch(
  '/:id/priority',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.changePriority,
  validate,
  controller.changePriority
);

router.post(
  '/:id/assign',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.assign,
  validate,
  controller.assign
);

router.delete(
  '/:id/assign/:assignmentId',
  authorize(ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  idParam(),
  idParam('assignmentId'),
  validate,
  controller.unassign
);

router.post(
  '/:id/comments',
  authorize(ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.addComment,
  validate,
  controller.addComment
);

// Chat entre el centro de control y el personal asignado. El ciudadano no
// entra aqui: por eso la misma lista de roles que /comments.
router.get(
  '/:id/messages',
  authorize(ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  idParam(),
  validate,
  controller.getMessages
);

router.post(
  '/:id/messages',
  authorize(ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  validator.addMessage,
  validate,
  controller.addMessage
);

router.post(
  '/:id/photos',
  authorize(ROLES.CIUDADANO, ROLES.PERSONAL, ROLES.OPERADOR, ROLES.ADMINISTRADOR),
  uploadEmergencyPhotos,
  idParam(),
  validate,
  controller.addPhotos
);

router.delete(
  '/:id',
  authorize(ROLES.ADMINISTRADOR),
  idParam(),
  validate,
  controller.remove
);

module.exports = router;
