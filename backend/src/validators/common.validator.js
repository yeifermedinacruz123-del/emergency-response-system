/**
 * Reglas de validacion reutilizables.
 *
 * Se centralizan aqui para que "una contrasena valida" o "una coordenada
 * valida" signifiquen lo mismo en el registro, en la creacion de usuarios y en
 * el reporte de una emergencia.
 */

'use strict';

const { body, param, query } = require('express-validator');

/** Id numerico en la ruta: /api/emergencies/:id */
const idParam = (name = 'id') =>
  param(name)
    .isInt({ min: 1 })
    .withMessage('El identificador debe ser un numero entero positivo')
    .toInt();

/**
 * Contrasena: minimo 8 caracteres con mayuscula, minuscula y numero.
 * No se exige simbolo para no volver el registro hostil, pero si longitud.
 */
const password = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('La contrasena debe tener entre 8 y 72 caracteres')
    .matches(/[a-z]/)
    .withMessage('La contrasena debe incluir al menos una letra minuscula')
    .matches(/[A-Z]/)
    .withMessage('La contrasena debe incluir al menos una letra mayuscula')
    .matches(/\d/)
    .withMessage('La contrasena debe incluir al menos un numero');

const email = (field = 'email') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('El correo electronico es obligatorio')
    .isEmail()
    .withMessage('El correo electronico no tiene un formato valido')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 120 })
    .withMessage('El correo no puede superar los 120 caracteres');

const personName = (field, label) =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage(`${label} es obligatorio`)
    .isLength({ min: 2, max: 80 })
    .withMessage(`${label} debe tener entre 2 y 80 caracteres`);

const documentNumber = (field = 'documentNumber') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('El numero de documento es obligatorio')
    .isLength({ min: 5, max: 20 })
    .withMessage('El documento debe tener entre 5 y 20 caracteres')
    .matches(/^[A-Za-z0-9-]+$/)
    .withMessage('El documento solo admite letras, numeros y guiones');

const documentType = (field = 'documentType') =>
  body(field)
    .optional()
    .isIn(['CC', 'TI', 'CE', 'PA'])
    .withMessage('El tipo de documento debe ser CC, TI, CE o PA');

const phone = (field = 'phone') =>
  body(field)
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9+()\s-]{7,20}$/)
    .withMessage('El telefono no tiene un formato valido');

/* --------------------------- Coordenadas GPS --------------------------- */

const latitude = (field = 'latitude') =>
  body(field)
    .notEmpty()
    .withMessage('La latitud es obligatoria')
    .isFloat({ min: -90, max: 90 })
    .withMessage('La latitud debe estar entre -90 y 90')
    .toFloat();

const longitude = (field = 'longitude') =>
  body(field)
    .notEmpty()
    .withMessage('La longitud es obligatoria')
    .isFloat({ min: -180, max: 180 })
    .withMessage('La longitud debe estar entre -180 y 180')
    .toFloat();

/* ------------------------- Listados y paginacion ------------------------ */

const pagination = () => [
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser un entero mayor que 0'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe estar entre 1 y 100'),
  query('order')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('order debe ser asc o desc'),
];

/** Rango de fechas ?from= y ?to= en formato ISO. */
const dateRange = () => [
  query('from').optional().isISO8601().withMessage('from debe ser una fecha ISO-8601'),
  query('to').optional().isISO8601().withMessage('to debe ser una fecha ISO-8601'),
];

module.exports = {
  idParam,
  password,
  email,
  personName,
  documentNumber,
  documentType,
  phone,
  latitude,
  longitude,
  pagination,
  dateRange,
};
