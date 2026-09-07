/**
 * Reglas de validacion de /api/emergencies
 *
 * Nota sobre el formulario con fotos: llega como multipart/form-data, asi que
 * TODOS los campos llegan como texto. Por eso las coordenadas usan .toFloat()
 * y los enteros .toInt(): sin eso, la latitud llegaria como "4.142" (string) y
 * PostgreSQL recibiria texto donde espera NUMERIC.
 */

'use strict';

const { body, query } = require('express-validator');

const common = require('./common.validator');
const {
  EMERGENCY_TYPES,
  PRIORITIES,
  EMERGENCY_STATUS,
} = require('../config/constants');

const TYPE_CODES = Object.values(EMERGENCY_TYPES);
const PRIORITY_CODES = Object.values(PRIORITIES);
const STATUS_CODES = Object.values(EMERGENCY_STATUS);

/** Campos de ubicacion compartidos por crear y actualizar. */
const locationFields = [
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La direccion no puede superar los 200 caracteres'),
  body('reference').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('La referencia no puede superar los 200 caracteres'),
  body('zoneId').optional({ values: 'falsy' }).isInt({ min: 1 })
    .withMessage('La zona debe ser un identificador valido').toInt(),
  body('accuracy').optional({ values: 'falsy' }).isFloat({ min: 0 })
    .withMessage('La precision del GPS debe ser un numero positivo').toFloat(),
];

/** POST /api/emergencies */
const create = [
  body('title').trim().notEmpty().withMessage('El titulo es obligatorio')
    .isLength({ min: 5, max: 150 })
    .withMessage('El titulo debe tener entre 5 y 150 caracteres'),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 })
    .withMessage('La descripcion no puede superar los 2000 caracteres'),
  body('type').trim().notEmpty().withMessage('El tipo de emergencia es obligatorio')
    .isIn(TYPE_CODES)
    .withMessage(`El tipo debe ser uno de: ${TYPE_CODES.join(', ')}`),
  body('priority').optional({ values: 'falsy' }).isIn(PRIORITY_CODES)
    .withMessage(`La prioridad debe ser una de: ${PRIORITY_CODES.join(', ')}`),
  common.latitude(),
  common.longitude(),
  ...locationFields,
];

/**
 * POST /api/emergencies/sos
 * Solo se exige la posicion: el boton SOS debe funcionar sin escribir nada.
 */
const sos = [
  common.latitude(),
  common.longitude(),
  body('type').optional({ values: 'falsy' }).isIn(TYPE_CODES)
    .withMessage(`El tipo debe ser uno de: ${TYPE_CODES.join(', ')}`),
  body('title').optional({ values: 'falsy' }).trim().isLength({ max: 150 })
    .withMessage('El titulo no puede superar los 150 caracteres'),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 })
    .withMessage('La descripcion no puede superar los 2000 caracteres'),
  ...locationFields,
];

/** PUT /api/emergencies/:id */
const update = [
  common.idParam(),
  body('title').optional().trim().isLength({ min: 5, max: 150 })
    .withMessage('El titulo debe tener entre 5 y 150 caracteres'),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 2000 })
    .withMessage('La descripcion no puede superar los 2000 caracteres'),
  body('latitude').optional().isFloat({ min: -90, max: 90 })
    .withMessage('La latitud debe estar entre -90 y 90').toFloat(),
  body('longitude').optional().isFloat({ min: -180, max: 180 })
    .withMessage('La longitud debe estar entre -180 y 180').toFloat(),
  // Las coordenadas se cambian juntas o no se cambian.
  body('longitude').custom((value, { req }) => {
    const hasLat = req.body.latitude !== undefined;
    const hasLng = req.body.longitude !== undefined;
    if (hasLat !== hasLng) {
      throw new Error('Para mover la ubicacion debes enviar latitude y longitude juntas');
    }
    return true;
  }),
  ...locationFields,
];

/** PATCH /api/emergencies/:id/status */
const changeStatus = [
  common.idParam(),
  body('status').trim().notEmpty().withMessage('El estado es obligatorio')
    .isIn(STATUS_CODES)
    .withMessage(`El estado debe ser uno de: ${STATUS_CODES.join(', ')}`),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 })
    .withMessage('Las notas no pueden superar los 1000 caracteres'),
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 1000 })
    .withMessage('El motivo no puede superar los 1000 caracteres'),
];

/** PATCH /api/emergencies/:id/priority */
const changePriority = [
  common.idParam(),
  body('priority').trim().notEmpty().withMessage('La prioridad es obligatoria')
    .isIn(PRIORITY_CODES)
    .withMessage(`La prioridad debe ser una de: ${PRIORITY_CODES.join(', ')}`),
];

/** POST /api/emergencies/:id/assign */
const assign = [
  common.idParam(),
  body('responderIds').isArray({ min: 1 })
    .withMessage('Debes enviar al menos una unidad en responderIds'),
  body('responderIds.*').isInt({ min: 1 })
    .withMessage('Cada unidad debe identificarse con un numero entero').toInt(),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 })
    .withMessage('Las notas no pueden superar los 500 caracteres'),
];

/** POST /api/emergencies/:id/comments */
const addComment = [
  common.idParam(),
  body('text').trim().notEmpty().withMessage('El comentario no puede estar vacio')
    .isLength({ min: 3, max: 1000 })
    .withMessage('El comentario debe tener entre 3 y 1000 caracteres'),
];

/** POST /api/emergencies/:id/messages */
const addMessage = [
  common.idParam(),
  body('message').trim().notEmpty().withMessage('El mensaje no puede estar vacio')
    .isLength({ min: 1, max: 1000 })
    .withMessage('El mensaje no puede superar los 1000 caracteres'),
];

/** GET /api/emergencies */
const listQuery = [
  ...common.pagination(),
  ...common.dateRange(),
  query('status').optional().isIn(STATUS_CODES)
    .withMessage(`status debe ser uno de: ${STATUS_CODES.join(', ')}`),
  query('type').optional().isIn(TYPE_CODES)
    .withMessage(`type debe ser uno de: ${TYPE_CODES.join(', ')}`),
  query('priority').optional().isIn(PRIORITY_CODES)
    .withMessage(`priority debe ser una de: ${PRIORITY_CODES.join(', ')}`),
  query('zone').optional().isInt({ min: 1 }).withMessage('zone debe ser un numero'),
  query('sos').optional().isIn(['true', 'false']).withMessage('sos debe ser true o false'),
];

module.exports = {
  create,
  sos,
  update,
  changeStatus,
  changePriority,
  assign,
  addComment,
  addMessage,
  listQuery,
};
