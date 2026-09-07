/**
 * Reglas de validacion de /api/auth
 */

'use strict';

const { body } = require('express-validator');
const common = require('./common.validator');

/** POST /api/auth/register */
const register = [
  common.personName('firstName', 'El nombre'),
  common.personName('lastName', 'El apellido'),
  common.email(),
  common.documentType(),
  common.documentNumber(),
  common.phone(),
  common.password(),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La direccion no puede superar los 200 caracteres'),
];

/**
 * POST /api/auth/login
 * Aqui NO se valida el formato de la contrasena: si alguien tiene una clave
 * antigua que no cumple las reglas nuevas, debe poder entrar para cambiarla.
 */
const login = [
  body('email').trim().notEmpty().withMessage('El correo es obligatorio').isEmail()
    .withMessage('El correo no tiene un formato valido')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('password').notEmpty().withMessage('La contrasena es obligatoria'),
];

/** POST /api/auth/refresh */
const refresh = [
  body('refreshToken').notEmpty().withMessage('El token de refresco es obligatorio'),
];

/** PUT /api/auth/profile */
const updateProfile = [
  body('firstName').optional().trim().isLength({ min: 2, max: 80 })
    .withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 })
    .withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('email').optional().trim().isEmail().withMessage('El correo no tiene un formato valido')
    .normalizeEmail({ gmail_remove_dots: false }),
  common.phone(),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La direccion no puede superar los 200 caracteres'),
];

/** PATCH /api/auth/password */
const changePassword = [
  body('currentPassword').notEmpty().withMessage('Debes indicar tu contrasena actual'),
  common.password('newPassword'),
  body('newPassword').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('La contrasena nueva debe ser distinta de la actual');
    }
    return true;
  }),
];

/** POST /api/auth/forgot-password */
const forgotPassword = [common.email()];

/** POST /api/auth/reset-password */
const resetPassword = [
  body('token').trim().notEmpty().withMessage('Falta el token de recuperacion'),
  common.password('newPassword'),
];

module.exports = {
  register, login, refresh, updateProfile, changePassword, forgotPassword, resetPassword,
};
