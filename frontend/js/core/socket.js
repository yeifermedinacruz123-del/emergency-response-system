/**
 * socket.js - Cliente de tiempo real.
 *
 * Envuelve a Socket.IO para que las paginas no tengan que saber como se
 * conecta ni como se autentica:
 *
 *   import { realtime } from '../core/socket.js';
 *   await realtime.connect();
 *   realtime.on(SOCKET_EVENTS.EMERGENCY_NEW, (emergencia) => { ... });
 *
 * La libreria la sirve el propio backend en /socket.io/socket.io.esm.min.js,
 * asi que no hace falta ningun CDN ni descargar nada: siempre coincide con la
 * version del servidor.
 */

import { CONFIG, SOCKET_EVENTS } from './config.js';
import { api } from './api.js';

/** Instancia de Socket.IO una vez conectada. */
let socket = null;

/** Promesa de conexion en curso, para no abrir dos sockets a la vez. */
let connecting = null;

/**
 * Manejadores registrados por las paginas.
 * Se guardan aqui y no solo en el socket para poder volver a engancharlos si
 * la conexion se cae y se rehace.
 * @type {Map<string, Set<Function>>}
 */
const handlers = new Map();

/** Escuchas del estado de la conexion (para pintar el indicador "En vivo"). */
const statusListeners = new Set();

let status = 'disconnected';

function setStatus(next, detail = null) {
  status = next;
  statusListeners.forEach((listener) => {
    try {
      listener(next, detail);
    } catch (error) {
      console.error('Error en un escucha de estado del socket:', error);
    }
  });
}

/** Conecta cada manejador guardado a la instancia actual del socket. */
function bindHandlers(instance) {
  handlers.forEach((callbacks, event) => {
    callbacks.forEach((callback) => instance.on(event, callback));
  });
}

export const realtime = {
  /**
   * Abre la conexion. Es idempotente: llamarla dos veces devuelve el mismo
   * socket, no abre uno nuevo.
   * @returns {Promise<object|null>} El socket, o null si no hay sesion.
   */
  async connect() {
    if (socket && socket.connected) return socket;
    if (connecting) return connecting;

    const token = api.tokens.getAccess();
    if (!token) return null;

    setStatus('connecting');

    connecting = (async () => {
      // Import dinamico: la libreria solo se descarga en las paginas que
      // realmente usan tiempo real.
      const { io } = await import('/socket.io/socket.io.esm.min.js');

      const instance = io(CONFIG.socket.url, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: CONFIG.socket.reconnectionAttempts,
        reconnectionDelay: CONFIG.socket.reconnectionDelay,
      });

      instance.on('connect', () => setStatus('connected'));
      instance.on('disconnect', (reason) => setStatus('disconnected', reason));
      instance.on('connect_error', (error) => setStatus('error', error.message));

      instance.on('connection:ready', (info) => {
        console.info('Tiempo real listo. Salas:', info.rooms.join(', '));
      });

      /*
       * Si el token expiro, el servidor rechaza el handshake. Se pide una
       * peticion cualquiera a la API, que renueva el token automaticamente, y
       * se reintenta con el token nuevo.
       */
      instance.on('connect_error', async (error) => {
        if (!/token/i.test(error.message)) return;

        try {
          await api.get('/auth/profile');
          const fresh = api.tokens.getAccess();
          if (fresh && instance.auth) {
            instance.auth.token = fresh;
            instance.connect();
          }
        } catch {
          // La sesion ya no es recuperable: la API redirigira al login.
        }
      });

      bindHandlers(instance);

      socket = instance;
      connecting = null;
      return instance;
    })();

    return connecting;
  },

  /** Cierra la conexion y olvida los manejadores. */
  disconnect() {
    if (socket) {
      socket.close();
      socket = null;
    }
    handlers.clear();
    setStatus('disconnected');
  },

  /**
   * Registra un manejador para un evento.
   * @returns {Function} Funcion para darlo de baja.
   */
  on(event, callback) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(callback);

    if (socket) socket.on(event, callback);

    return () => realtime.off(event, callback);
  },

  /** Da de baja un manejador. */
  off(event, callback) {
    const callbacks = handlers.get(event);
    if (callbacks) callbacks.delete(callback);
    if (socket) socket.off(event, callback);
  },

  /**
   * Sigue una emergencia concreta para recibir sus actualizaciones.
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  subscribeToEmergency(emergencyId) {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, message: 'Sin conexion en tiempo real' });
      socket.emit('emergency:subscribe', emergencyId, resolve);
      setTimeout(() => resolve({ ok: false, message: 'El servidor no respondio' }), 5000);
    });
  },

  /** Deja de seguir una emergencia. */
  unsubscribeFromEmergency(emergencyId) {
    if (socket) socket.emit('emergency:unsubscribe', emergencyId);
  },

  /** Estado actual: connecting | connected | disconnected | error. */
  getStatus() {
    return status;
  },

  /**
   * Escucha los cambios de estado de la conexion.
   * @returns {Function} Funcion para dejar de escuchar.
   */
  onStatusChange(listener) {
    statusListeners.add(listener);
    listener(status, null);
    return () => statusListeners.delete(listener);
  },

  get connected() {
    return Boolean(socket && socket.connected);
  },
};

export { SOCKET_EVENTS };
export default realtime;
