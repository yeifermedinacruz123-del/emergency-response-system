/**
 * Construccion de la aplicacion Express.
 *
 * Este archivo SOLO arma la app (middlewares + rutas). El arranque del servidor
 * HTTP y de Socket.IO esta en server.js, para poder importar la app en pruebas
 * sin abrir un puerto.
 */

'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const { config } = require('./config/env');
const logger = require('./config/logger');
const apiRoutes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

/* ---------------------------------------------------------------------------
 *  Confianza en el proxy
 *
 *  Se lee de la configuracion y por defecto vale 0 (sin proxy). Confiar en un
 *  proxy que no existe es un problema de seguridad real: Express tomaria la IP
 *  de la cabecera X-Forwarded-For, que la escribe el cliente, y el limitador de
 *  intentos de acceso se podria burlar cambiandola en cada peticion.
 *
 *  Al desplegar detras de Nginx, Render o similar: TRUST_PROXY=1 en el .env.
 * ------------------------------------------------------------------------- */
app.set('trust proxy', config.server.trustProxy);
app.disable('x-powered-by');

/* ---------------------------------------------------------------------------
 *  Seguridad de cabeceras HTTP
 *  La CSP permite explicitamente Leaflet (unpkg), Chart.js (jsDelivr) y las
 *  teselas de OpenStreetMap. Todo lo demas queda bloqueado.
 * ------------------------------------------------------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        /*
         * Las teselas del mapa tambien necesitan estar aqui, no solo en
         * imgSrc: el service worker las intercepta para guardarlas en cache
         * (cacheFirst en service-worker.js) y las vuelve a pedir con
         * fetch(), una llamada que CSP evalua contra connect-src, no contra
         * img-src. Sin esto el <img> de Leaflet nunca falla directamente,
         * pero el fetch interno del service worker si, y como ese fetch es
         * el que de verdad trae la imagen, el mapa se queda en blanco.
         *
         * No se veia en desarrollo porque el navegador de pruebas de la
         * sesion no llega a registrar el service worker; en un navegador
         * real, con el service worker activo, el fallo era inmediato.
         */
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.tile.openstreetmap.org'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],

        /*
         * upgrade-insecure-requests viene activada por defecto en helmet, y en
         * desarrollo hay que quitarla (null la elimina).
         *
         * Con ella, el navegador reescribe a https:// TODO subrecurso de la
         * pagina. Contra este servidor, que es HTTP, cada CSS y cada JS muere
         * con ERR_SSL_PROTOCOL_ERROR y la aplicacion sale en crudo, con las
         * fuentes por defecto del navegador.
         *
         * No se notaba entrando por localhost porque los navegadores eximen a
         * los origenes de confianza de esa reescritura. Solo aparecia al abrir
         * la PWA desde el telefono por la IP de la red local, que es el unico
         * modo de usarla en un movil sin cable.
         *
         * En produccion se mantiene: alli el servidor va detras de HTTPS y la
         * directiva es justo lo que se quiere.
         */
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/* ---------------------------------------------------------------------------
 *  CORS con lista blanca
 * ------------------------------------------------------------------------- */
/**
 * Direcciones de red privada, segun RFC 1918.
 * Sirve para reconocer un telefono conectado al mismo router durante el
 * desarrollo: 192.168.x.x, 10.x.x.x y 172.16-31.x.x
 */
const PRIVATE_ORIGIN = new RegExp(
  '^https?://(' +
    '192\\.168\\.\\d{1,3}\\.\\d{1,3}' +
    '|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}' +
    '|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}' +
    '|localhost|127\\.0\\.0\\.1|\\[::1\\]' +
  ')(:\\d+)?$'
);

/**
 * Decide si se acepta un origen.
 *
 * Tres reglas, en orden:
 *
 *   1. MISMO ORIGEN. Si el Origin coincide con el host por el que ha entrado
 *      la peticion, se acepta siempre. Es el caso normal: el servidor sirve
 *      tambien el frontend, asi que la pagina y la API comparten origen. Esto
 *      hace que funcione por cualquier via de acceso —localhost, la IP de la
 *      red local, un tunel HTTPS— sin tener que ir apuntando dominios uno a
 *      uno. No abre nada: el navegador ya trata esas peticiones como propias.
 *
 *   2. LISTA BLANCA. Los origenes de CORS_ORIGIN, para clientes externos.
 *
 *   3. RED PRIVADA, solo en desarrollo. Cubre el caso de abrir la aplicacion
 *      desde el movil por la IP del router cuando el Origin no coincide
 *      exactamente con el host.
 */
function isOriginAllowed(origin, requestHost) {
  if (config.security.corsOrigins.includes(origin)) return true;

  // Mismo origen: se compara el host del Origin con el host de la peticion.
  try {
    if (requestHost && new URL(origin).host === requestHost) return true;
  } catch {
    // Origin mal formado: se rechaza mas abajo.
  }

  if (!config.isProduction && PRIVATE_ORIGIN.test(origin)) return true;

  return false;
}

app.use(
  cors((req, callback) => {
    const { origin } = req.headers;

    // Peticiones sin Origin (Postman, curl, navegacion normal)
    if (!origin || isOriginAllowed(origin, req.headers.host)) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
    }

    /*
     * Se rechaza con error, no con `{ origin: false }`.
     *
     * La diferencia importa: con `origin: false` la peticion SE EJECUTA y solo
     * se omite la cabecera Access-Control-Allow-Origin, de modo que el
     * navegador oculta la respuesta pero el servidor ya hizo el trabajo —
     * consumir el limitador, abrir una sesion, escribir en la base—. Con un
     * error, la peticion no llega al controlador.
     */
    logger.warn(`CORS bloqueo el origen: ${origin}`);
    return callback(new Error('Origen no permitido por CORS'));
  })
);

/* ---------------------------------------------------------------------------
 *  Parseo del cuerpo, compresion y registro de peticiones
 * ------------------------------------------------------------------------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression());

const morganFormat = config.isProduction ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.debug(message.trim()) },
    skip: (req) => req.originalUrl === '/api/health',
  })
);

/* ---------------------------------------------------------------------------
 *  Archivos subidos (fotografias de las emergencias)
 * ------------------------------------------------------------------------- */
app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '../uploads'), {
    maxAge: '7d',
    fallthrough: true,
  })
);

/* ---------------------------------------------------------------------------
 *  API REST
 * ------------------------------------------------------------------------- */
app.use(config.server.apiPrefix, apiLimiter, apiRoutes);

/* ---------------------------------------------------------------------------
 *  Frontend estatico
 *  Se sirve desde el mismo origen para que funcionen la Geolocation API y el
 *  Service Worker de la PWA sin necesidad de HTTPS en desarrollo.
 * ------------------------------------------------------------------------- */
if (config.frontend.serve) {
  const frontendPath = path.resolve(__dirname, config.frontend.dir);

  app.use(
    express.static(frontendPath, {
      extensions: ['html'],
      setHeaders(res, filePath) {
        // El service worker nunca debe quedar cacheado por el navegador.
        if (filePath.endsWith('service-worker.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        }
      },
    })
  );

  // Cualquier ruta que no sea de la API y no sea un archivo devuelve index.html.
  app.get(/^\/(?!api|uploads).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    return res.sendFile(path.join(frontendPath, 'index.html'), (error) => {
      if (error) next();
    });
  });
}

/* ---------------------------------------------------------------------------
 *  Errores (siempre al final)
 * ------------------------------------------------------------------------- */
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
