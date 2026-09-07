/**
 * Rutas de /api/notifications
 * Disponibles para cualquier usuario autenticado, sobre su propia bandeja.
 */

'use strict';

const { Router } = require('express');

const controller = require('../controllers/notification.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { idParam, pagination } = require('../validators/common.validator');

const router = Router();

router.use(authenticate);

router.get('/', pagination(), validate, controller.list);
router.get('/unread-count', controller.unreadCount);

// ---- Notificaciones push ----
// push-key va antes que /:id/read para que no se lea como un identificador.
router.get('/push-key', controller.pushKey);
router.post('/subscribe', controller.subscribe);
router.delete('/subscribe', controller.unsubscribe);
router.post('/test', controller.sendTest);

// read-all va antes que /:id/read para que "read-all" no se lea como un id.
router.patch('/read-all', controller.markAllAsRead);
router.patch('/:id/read', idParam(), validate, controller.markAsRead);

module.exports = router;
