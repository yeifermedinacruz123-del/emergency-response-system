/**
 * Servidor de Socket.IO.
 *
 * Se engancha al MISMO servidor HTTP que Express, asi que no hace falta un
 * segundo puerto ni configuracion extra de CORS para el frontend.
 *
 * Modelo de seguridad: un socket no es un canal libre. Antes de aceptar la
 * conexion se exige el mismo accessToken que la API REST, se comprueba que el
 * usuario siga activo y se le mete UNICAMENTE en las salas que su rol permite.
 * Sin esto, cualquiera podria conectarse y escuchar todas las emergencias de
 * la ciudad.
 *
 * Salas:
 *   control-room   operadores y administradores  (todo el flujo)
 *   responders     personal de emergencia        (avisos generales)
 *   user:<id>      cada usuario                  (lo suyo: notificaciones)
 *   emergency:<id> quien tiene abierto un detalle
 */

'use strict';

const { Server } = require('socket.io');

const { config } = require('../config/env');
const { ROLES, SOCKET_ROOMS } = require('../config/constants');
const logger = require('../config/logger');
const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/user.model');
const emergencyModel = require('../models/emergency.model');
const responderModel = require('../models/responder.model');
const assignmentModel = require('../models/assignment.model');
const realtime = require('./realtime');

/** Roles que ven todo el centro de control. */
function isControlRoom(roleCode) {
  return roleCode === ROLES.OPERADOR || roleCode === ROLES.ADMINISTRADOR;
}

/**
 * Toma el token del handshake.
 * Se aceptan dos formas porque no todos los clientes pueden usar la primera:
 *   socket.handshake.auth.token   -> io(url, { auth: { token } })   preferida
 *   cabecera Authorization        -> util para pruebas con curl/Postman
 */
function extractToken(socket) {
  const fromAuth = socket.handshake.auth && socket.handshake.auth.token;
  if (fromAuth) return String(fromAuth).replace(/^Bearer\s+/i, '').trim();

  const header = socket.handshake.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

/**
 * Middleware de autenticacion del handshake.
 * Rechazar aqui evita que un socket no autenticado llegue siquiera a conectarse.
 */
async function authenticateSocket(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error('Falta el token de autenticacion'));

    const payload = verifyAccessToken(token);
    const user = await userModel.findById(payload.sub);

    if (!user) return next(new Error('La cuenta asociada a la sesion ya no existe'));
    if (!user.is_active) return next(new Error('Tu cuenta esta desactivada'));

    // Queda disponible en todos los manejadores de este socket.
    socket.user = user;
    return next();
  } catch (error) {
    // Mensaje corto: el detalle queda en el log del servidor, no en el cliente.
    logger.warn(`Socket rechazado: ${error.message}`);
    return next(new Error('Token invalido o expirado'));
  }
}

/** Mete al socket en las salas que le corresponden por su rol. */
async function joinRoleRooms(socket) {
  const { user } = socket;

  // Canal personal: notificaciones dirigidas a este usuario.
  socket.join(SOCKET_ROOMS.user(user.id));

  if (isControlRoom(user.role_code)) {
    socket.join(SOCKET_ROOMS.CONTROL_ROOM);
    return;
  }

  if (user.role_code === ROLES.PERSONAL) {
    socket.join(SOCKET_ROOMS.RESPONDERS);

    // Se une automaticamente a las emergencias que ya tiene asignadas, para
    // que reciba sus actualizaciones sin tener que suscribirse a mano.
    const responder = await responderModel.findByUserId(user.id);
    if (responder) {
      socket.responderId = responder.id;
      const { items } = await emergencyModel.list(
        { responderId: responder.id, activeOnly: true },
        { limit: 50, offset: 0 },
        {}
      );
      items.forEach((emergency) => socket.join(SOCKET_ROOMS.emergency(emergency.id)));
    }
  }
}

/**
 * Comprueba si el usuario puede seguir una emergencia concreta.
 * Reproduce la misma regla que la API REST: el ciudadano solo las suyas, el
 * personal solo las asignadas, el centro de control todas.
 */
async function canFollowEmergency(user, emergencyId) {
  if (isControlRoom(user.role_code)) return true;

  const emergency = await emergencyModel.findById(emergencyId);
  if (!emergency) return false;

  if (user.role_code === ROLES.CIUDADANO) {
    return emergency.reporter_id === user.id;
  }

  if (user.role_code === ROLES.PERSONAL) {
    const responder = await responderModel.findByUserId(user.id);
    if (!responder) return false;
    const assignments = await assignmentModel.findByEmergency(emergencyId);
    return assignments.some(
      (assignment) =>
        assignment.responder_id === responder.id && assignment.status !== 'CANCELADO'
    );
  }

  return false;
}

/** Registra los eventos que el cliente puede enviar. */
function registerClientEvents(socket) {
  /**
   * El cliente abre el detalle de una emergencia y quiere sus actualizaciones.
   * Se valida el permiso ANTES de unirlo a la sala.
   */
  socket.on('emergency:subscribe', async (emergencyId, acknowledge) => {
    const id = Number.parseInt(emergencyId, 10);

    if (Number.isNaN(id)) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, message: 'Identificador de emergencia invalido' });
      }
      return;
    }

    const allowed = await canFollowEmergency(socket.user, id);
    if (!allowed) {
      logger.warn(
        `Socket ${socket.user.email} intento seguir la emergencia ${id} sin permiso`
      );
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, message: 'No tienes permiso para seguir esta emergencia' });
      }
      return;
    }

    socket.join(SOCKET_ROOMS.emergency(id));
    if (typeof acknowledge === 'function') acknowledge({ ok: true, emergencyId: id });
  });

  /** El cliente cierra el detalle. */
  socket.on('emergency:unsubscribe', (emergencyId, acknowledge) => {
    const id = Number.parseInt(emergencyId, 10);
    if (!Number.isNaN(id)) socket.leave(SOCKET_ROOMS.emergency(id));
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
  });

  /** Diagnostico: en que salas esta este socket. Util al depurar la interfaz. */
  socket.on('rooms:list', (acknowledge) => {
    if (typeof acknowledge === 'function') {
      acknowledge({ ok: true, rooms: Array.from(socket.rooms) });
    }
  });

  socket.on('disconnect', (reason) => {
    logger.debug(`Socket desconectado: ${socket.user.email} (${reason})`);
  });
}

/**
 * Crea y configura el servidor de Socket.IO.
 * @param {import('http').Server} httpServer El mismo que usa Express.
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.security.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // La PWA cambia de red al salir a la calle: conviene tolerar cortes.
    pingTimeout: 25000,
    pingInterval: 20000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
  });

  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    try {
      await joinRoleRooms(socket);
      registerClientEvents(socket);

      logger.debug(
        `Socket conectado: ${socket.user.email} (${socket.user.role_code}) id=${socket.id}`
      );

      // El cliente sabe asi que ya esta autenticado y en sus salas.
      socket.emit('connection:ready', {
        userId: socket.user.id,
        role: socket.user.role_code,
        rooms: Array.from(socket.rooms).filter((room) => room !== socket.id),
      });
    } catch (error) {
      logger.error(`Error al preparar el socket de ${socket.user.email}`, error);
      socket.disconnect(true);
    }
  });

  // A partir de aqui los servicios pueden emitir.
  realtime.setServer(io);

  logger.info('Socket.IO listo');
  return io;
}

module.exports = { createSocketServer };
