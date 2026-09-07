/**
 * Carga, valida y expone la configuracion del sistema.
 *
 * Toda la aplicacion lee la configuracion desde aqui: ningun otro archivo
 * accede directamente a process.env. Asi hay un unico punto donde revisar
 * que variables existen, cual es su valor por defecto y cuales son obligatorias.
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');

// El archivo .env vive en backend/.env  (dos niveles arriba de src/config)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Convierte "true"/"false" de texto a booleano real. */
function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

/** Convierte un texto a numero, con valor por defecto si no es valido. */
function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Convierte "a,b,c" en ['a','b','c'] sin espacios ni vacios. */
function toList(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const config = {
  env: NODE_ENV,
  isProduction,
  isDevelopment: NODE_ENV === 'development',

  server: {
    port: toInt(process.env.PORT, 4000),
    host: process.env.HOST || '0.0.0.0',
    apiPrefix: process.env.API_PREFIX || '/api',

    /*
     * Servidor HTTPS adicional para probar desde el telefono.
     *
     * El navegador solo da GPS, camara y service worker en "contexto seguro":
     * HTTPS o localhost. Desde el movil la aplicacion se abre por la IP de la
     * red, que no es ninguno de los dos, y Chrome bloquea la ubicacion sin
     * preguntar. Con esto el mismo servidor escucha tambien en HTTPS, con un
     * certificado propio (npm run cert), y el permiso si se pide.
     *
     * No sustituye a HTTP: los dos puertos quedan levantados a la vez.
     */
    httpsEnabled: toBool(process.env.HTTPS_ENABLED, true),
    httpsPort: toInt(process.env.HTTPS_PORT, 4443),

    /*
     * Cuantos proxies inversos hay DELANTE de la aplicacion.
     *
     * Por defecto 0 (ninguno), y es importante que sea asi: con este valor en 1
     * sin que exista un proxy real, Express toma la IP de la cabecera
     * X-Forwarded-For. Como esa cabecera la escribe el cliente, cualquiera
     * podria cambiarla en cada peticion y el limitador de intentos de acceso
     * dejaria de servir: contaria cada intento como si viniera de una IP nueva.
     *
     * Al desplegar detras de Nginx, Render o similar, poner TRUST_PROXY=1.
     */
    trustProxy: toInt(process.env.TRUST_PROXY, 0),
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'ers_db',
    user: process.env.DB_USER || 'ers_user',
    password: process.env.DB_PASSWORD || '',
    ssl: toBool(process.env.DB_SSL, false),
    poolMax: toInt(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT, 30000),
    connectionTimeoutMillis: toInt(process.env.DB_CONNECTION_TIMEOUT, 5000),
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  security: {
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
    corsOrigins: toList(process.env.CORS_ORIGIN, [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ]),
    rateLimit: {
      windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: toInt(process.env.RATE_LIMIT_MAX, 300),
      authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 5),
    },
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    uploadDir: process.env.UPLOAD_DIR || 'uploads/emergencies',
    maxFileSizeBytes: toInt(process.env.MAX_FILE_SIZE_MB, 5) * 1024 * 1024,
    maxFilesPerEmergency: toInt(process.env.MAX_FILES_PER_EMERGENCY, 5),
    allowedMimeTypes: toList(process.env.ALLOWED_MIME_TYPES, [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    // La nota de voz del reporte: los navegadores no siempre acuerdan el mismo
    // formato (Chrome/Android graban webm, Safari/iOS graba mp4), asi que se
    // acepta cualquiera de los que produce MediaRecorder en uso real.
    allowedAudioMimeTypes: toList(process.env.ALLOWED_AUDIO_MIME_TYPES, [
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/aac',
    ]),
  },

  /**
   * Hoja de calculo con los accesos de demostracion.
   * Guarda contrasenas en texto plano: es una ayuda para la sustentacion, no
   * una funcion de produccion. Se apaga con CREDENTIALS_SHEET_ENABLED=false.
   */
  credentials: {
    enabled: toBool(process.env.CREDENTIALS_SHEET_ENABLED, true),
    // Ruta relativa desde backend/
    dir: process.env.CREDENTIALS_DIR || 'storage/credenciales',
    fileName: process.env.CREDENTIALS_FILE || 'usuarios-y-contrasenas.xlsx',
    // La misma que documenta database/seed.sql
    seedPassword: process.env.SEED_PASSWORD || 'Emergencia2026*',
  },

  frontend: {
    serve: toBool(process.env.SERVE_FRONTEND, true),
    // Ruta relativa desde backend/src
    dir: process.env.FRONTEND_DIR || '../../frontend',
  },

  /**
   * Correo saliente (recuperacion de contrasena, aviso a contactos de confianza).
   *
   * Sin SMTP_HOST configurado, el sistema no se rompe: mailer.service.js
   * escribe el enlace en la consola del servidor en vez de enviarlo. Es el
   * mismo patron que los certificados HTTPS de este proyecto: funciona sin
   * configuracion para desarrollo, y basta con poner estas variables en
   * backend/.env para que envie correos de verdad.
   */
  mail: {
    enabled: Boolean(process.env.SMTP_HOST),
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromAddress: process.env.MAIL_FROM || 'Emergency Response System <no-responder@ers.gov.co>',
  },

  geo: {
    city: process.env.DEFAULT_CITY || 'Villavicencio',
    department: process.env.DEFAULT_DEPARTMENT || 'Meta',
    lat: Number.parseFloat(process.env.DEFAULT_LAT || '4.1420'),
    lng: Number.parseFloat(process.env.DEFAULT_LNG || '-73.6266'),
    zoom: toInt(process.env.DEFAULT_MAP_ZOOM, 13),
  },

  logs: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    toFile: toBool(process.env.LOG_TO_FILE, false),
    dir: process.env.LOG_DIR || 'logs',
  },

  /*
   * Notificaciones push mediante Web Push, el estandar del navegador.
   *
   * Las claves VAPID las genera el propio proyecto con:
   *   node -e "console.log(require('web-push').generateVAPIDKeys())"
   *
   * NO son credenciales de un servicio externo: identifican a este servidor
   * ante el navegador. En Android, Chrome entrega estos mensajes a traves de
   * su propia infraestructura (la misma que usa FCM) sin que el backend tenga
   * que registrarse en ningun sitio.
   */
  push: {
    enabled: toBool(process.env.PUSH_ENABLED, false),
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@ers.local',
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
  },
};

/**
 * Variables sin las cuales el sistema no puede funcionar de forma segura.
 * En desarrollo se avisa; en produccion se detiene el arranque.
 */
const REQUIRED_VARS = ['DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return !value || value.startsWith('CAMBIAR');
  });

  if (missing.length === 0) return { ok: true, missing: [] };

  const message =
    'Faltan variables de entorno obligatorias o siguen con el valor de ejemplo: ' +
    missing.join(', ');

  if (isProduction) {
    // En produccion no se arranca con secretos por defecto.
    throw new Error(message);
  }

  return { ok: false, missing, message };
}

module.exports = { config, validateEnv };
