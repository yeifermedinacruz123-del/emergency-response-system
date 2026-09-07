/**
 * Reglas de validacion de /api/users  (solo administrador)
 */

'use strict';

const { body, query } = require('express-validator');

const common = require('./common.validator');
const { ROLES } = require('../config/constants');

const ROLE_CODES = Object.values(ROLES);

/** POST /api/users */
const create = [
  common.personName('firstName', 'El nombre'),
  common.personName('lastName', 'El apellido'),
  common.email(),
  common.documentType(),
  common.documentNumber(),
  common.phone(),
  common.password(),
  body('role').trim().notEmpty().withMessage('El rol es obligatorio')
    .isIn(ROLE_CODES).withMessage(`El rol debe ser uno de: ${ROLE_CODES.join(', ')}`),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La direccion no puede superar los 200 caracteres'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser true o false').toBoolean(),
];

/** PUT /api/users/:id */
const update = [
  common.idParam(),
  body('firstName').optional().trim().isLength({ min: 2, max: 80 })
    .withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName').optional().trim().isLength({ min: 2, max: 80 })
    .withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('email').optional().trim().isEmail().withMessage('El correo no tiene un formato valido')
    .normalizeEmail({ gmail_remove_dots: false }),
  common.documentType(),
  body('documentNumber').optional().trim().isLength({ min: 5, max: 20 })
    .withMessage('El documento debe tener entre 5 y 20 caracteres'),
  common.phone(),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La direccion no puede superar los 200 caracteres'),
  body('role').optional().isIn(ROLE_CODES)
    .withMessage(`El rol debe ser uno de: ${ROLE_CODES.join(', ')}`),
];

/** PATCH /api/users/:id/status */
const changeStatus = [
  common.idParam(),
  body('isActive').exists().withMessage('isActive es obligatorio')
    .isBoolean().withMessage('isActive debe ser true o false').toBoolean(),
];

/** PATCH /api/users/:id/role */
const changeRole = [
  common.idParam(),
  body('role').trim().notEmpty().withMessage('El rol es obligatorio')
    .isIn(ROLE_CODES).withMessage(`El rol debe ser uno de: ${ROLE_CODES.join(', ')}`),
];

/** GET /api/users */
const listQuery = [
  ...common.pagination(),
  query('role').optional().isIn(ROLE_CODES)
    .withMessage(`role debe ser uno de: ${ROLE_CODES.join(', ')}`),
  query('active').optional().isIn(['true', 'false'])
    .withMessage('active debe ser true o false'),
];

module.exports = { create, update, changeStatus, changeRole, listQuery };
