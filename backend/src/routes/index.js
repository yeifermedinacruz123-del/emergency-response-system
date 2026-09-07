/**
 * Enrutador principal de la API.
 *
 * Cada modulo se monta bajo su prefijo. La proteccion (autenticacion y roles)
 * se declara dentro de cada archivo de rutas, junto a los endpoints que
 * protege, para que al leer una ruta se vea de inmediato quien puede usarla.
 */

'use strict';

const { Router } = require('express');

const router = Router();

// ---- Estado del servicio y configuracion publica (sin sesion) ----
router.use('/', require('./health.routes'));

// ---- Autenticacion ----
router.use('/auth', require('./auth.routes'));

// ---- Nucleo del sistema ----
router.use('/emergencies', require('./emergency.routes'));
router.use('/responders', require('./responder.routes'));
router.use('/users', require('./user.routes'));
router.use('/contacts', require('./contact.routes'));

// ---- Apoyo ----
router.use('/catalogs', require('./catalog.routes'));
router.use('/statistics', require('./statistics.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/audit', require('./audit.routes'));
router.use('/settings', require('./setting.routes'));

module.exports = router;
