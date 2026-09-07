/**
 * Reglas de validacion de /api/responders
 */

'use strict';

const { body, query } = require('express-validator');

const common = require('./common.validator');
const { RESPONDER_TYPES, RESPONDER_STATUS } = require('../config/constants');

const TYPE_CODES = Object.values(RESPONDER_TYPES);
const STATUS_CODES = Object.values(RESPONDER_STATUS);

/** POST /api/responders */
const create = [
  body('userId').notEmpty().withMessage('Debes indicar el usuario asociado')
    .isInt({ min: 1 }).withMessage('userId debe ser un numero entero').toInt(),
  body('responderType').trim().notEmpty().withMessage('El tipo de personal es obligatorio')
    .isIn(TYPE_CODES).withMessage(`El tipo debe ser uno de: ${TYPE_CODES.join(', ')}`),
  body('unitCode').trim().notEmpty().withMessage('El codigo de unidad es obligatorio')
    .isLength({ min: 2, max: 30 })
    .withMessage('El codigo de unidad debe tener entre 2 y 30 caracteres')
    .matches(/^[A-Za-z0-9-]+$/)
    .withMessage('El codigo de unidad solo admite letras, numeros y guiones'),
  body('unitName').optional({ values: 'falsy' }).trim().isLength({ max: 80 })
    .withMessage('El nombre de la unidad no puede superar los 80 caracteres'),
  body('institution').optional({ values: 'falsy' }).trim().isLength({ max: 100 })
    .withMessage('La institucion no puede superar los 100 caracteres'),
  body('status').optional().isIn(STATUS_CODES)
    .withMessage(`El estado debe ser uno de: ${STATUS_CODES.join(', ')}`),
];

/** PUT /api/responders/:id */
const update = [
  common.idParam(),
  body('responderType').optional().isIn(TYPE_CODES)
    .withMessage(`El tipo debe ser uno de: ${TYPE_CODES.join(', ')}`),
  body('unitCode').optional().trim().isLength({ min: 2, max: 30 })
    .withMessage('El codigo de unidad debe tener entre 2 y 30 caracteres')
    .matches(/^[A-Za-z0-9-]+$/)
    .withMessage('El codigo de unidad solo admite letras, numeros y guiones'),
  body('unitName').optional({ values: 'falsy' }).trim().isLength({ max: 80 })
    .withMessage('El nombre de la unidad no puede superar los 80 caracteres'),
  body('institution').optional({ values: 'falsy' }).trim().isLength({ max: 100 })
    .withMessage('La institucion no puede superar los 100 caracteres'),
  body('status').optional().isIn(STATUS_CODES)
    .withMessage(`El estado debe ser uno de: ${STATUS_CODES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser true o false').toBoolean(),
];

/** PATCH /api/responders/:id/status */
const changeStatus = [
  common.idParam(),
  body('status').trim().notEmpty().withMessage('El estado es obligatorio')
    .isIn(STATUS_CODES).withMessage(`El estado debe ser uno de: ${STATUS_CODES.join(', ')}`),
];

/** PATCH /api/responders/me/location */
const updateLocation = [common.latitude(), common.longitude()];

/** GET /api/responders */
const listQuery = [
  ...common.pagination(),
  query('type').optional().isIn(TYPE_CODES)
    .withMessage(`type debe ser uno de: ${TYPE_CODES.join(', ')}`),
  query('status').optional().isIn(STATUS_CODES)
    .withMessage(`status debe ser uno de: ${STATUS_CODES.join(', ')}`),
];

/** GET /api/responders/available */
const availableQuery = [
  query('type').optional().isIn(TYPE_CODES)
    .withMessage(`type debe ser uno de: ${TYPE_CODES.join(', ')}`),
  query('lat').optional().isFloat({ min: -90, max: 90 })
    .withMessage('lat debe estar entre -90 y 90'),
  query('lng').optional().isFloat({ min: -180, max: 180 })
    .withMessage('lng debe estar entre -180 y 180'),
  query('limit').optional().isInt({ min: 1, max: 50 })
    .withMessage('limit debe estar entre 1 y 50'),
];

module.exports = { create, update, changeStatus, updateLocation, listQuery, availableQuery };
