/**
 * Rutas de /api/auth
 *
 * El login y el registro llevan un limitador estricto (authLimiter): 5 intentos
 * por ventana. Es la defensa contra fuerza bruta sobre las contrasenas.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/auth.controller');
const validator = require('../validators/auth.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');

const router = Router();

// ---- Publicas ----
router.post('/register', authLimiter, validator.register, validate, controller.register);
router.post('/login', authLimiter, validator.login, validate, controller.login);
// /refresh tambien va limitado: es publico y hace verificacion criptografica
// mas una consulta a la base. authLimiter omite las peticiones correctas, asi
// que solo cuentan los intentos fallidos.
router.post('/refresh', authLimiter, validator.refresh, validate, controller.refresh);
// Mismo limitador que login: evita usarlo para adivinar que correos existen
// y evita que alguien inunde una bandeja ajena de enlaces de recuperacion.
router.post(
  '/forgot-password',
  authLimiter,
  validator.forgotPassword,
  validate,
  controller.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validator.resetPassword,
  validate,
  controller.resetPassword
);

// ---- Requieren sesion ----
router.post('/logout', authenticate, controller.logout);
router.get('/profile', authenticate, controller.getProfile);
router.put('/profile', authenticate, validator.updateProfile, validate, controller.updateProfile);
router.patch(
  '/password',
  authenticate,
  validator.changePassword,
  validate,
  controller.changePassword
);

module.exports = router;
