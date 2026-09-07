/**
 * Punto de entrada del backend.
 *
 * Responsabilidades:
 *   1. Validar la configuracion antes de arrancar.
 *   2. Crear el servidor HTTP con la app de Express.
 *   3. Comprobar la conexion con PostgreSQL e informar el estado.
 *   4. Apagar el proceso de forma ordenada (cerrar el pool y las conexiones).
 *
 * Socket.IO se engancha a este mismo servidor HTTP en la Fase 7.
 */

'use strict';

const http = require('http');
const https = require('https');
const os = require('os');

const app = require('./app');
const { config, validateEnv } = require('./config/env');
const logger = require('./config/logger');
const { checkConnection, closePool } = require('./database');
const { createSocketServer } = require('./sockets');
const pushService = require('./services/push.service');

const server = http.createServer(app);

// Socket.IO comparte el servidor HTTP de Express: mismo puerto, mismo origen.
const io = createSocketServer(server);

/*
 * Servidor HTTPS opcional, con la MISMA app y el MISMO Socket.IO.
 *
 * Existe por una sola razon: desde el telefono la aplicacion se abre por la IP
 * de la red local, y el navegador no entrega el GPS ni registra el service
 * worker en direcciones http:// que no sean localhost. En HTTPS si.
 *
 * Si todavia no hay certificado (npm run cert), queda en null y el sistema
 * arranca normalmente solo con HTTP.
 */
let httpsServer = null;

/*
 * Las utilidades del certificado se cargan solo si HTTPS_ENABLED esta activo.
 *
 * No es una optimizacion: make-cert.js depende de `selfsigned`, que es una
 * dependencia de DESARROLLO. En un despliegue de produccion (Render, Railway)
 * no se instala, y el HTTPS lo termina el propio proveedor, asi que este
 * servidor solo habla HTTP. Con el require arriba del todo, el servidor no
 * arrancaba alli: moria con MODULE_NOT_FOUND antes de escuchar el puerto.
 */
let certTools = null;


/**
 * Direccion del equipo en la red local (192.168.x.x, 10.x.x.x…).
 *
 * Hace falta porque desde un telefono `localhost` NO es este servidor: es el
 * propio telefono, y por eso una URL con localhost da ERR_CONNECTION_REFUSED.
 * Para abrir la PWA en el movil hay que usar esta direccion, con el telefono
 * en la misma red Wi-Fi.
 *
 * @returns {string|null} La primera IPv4 no interna, o null si no hay red.
 */
function localNetworkAddress() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }

  return null;
}

/** Banner de arranque con la informacion util para el desarrollador. */
function printBanner(databaseStatus) {
  const url = `http://localhost:${config.server.port}`;
  const lanAddress = localNetworkAddress();
  const dbLine = databaseStatus.connected
    ? `conectada (${databaseStatus.version})`
    : `SIN CONEXION -> ${databaseStatus.error}`;

  logger.raw('');
  logger.raw('  ===========================================================');
  logger.raw('    EMERGENCY RESPONSE SYSTEM  -  API');
  logger.raw('  ===========================================================');
  logger.raw(`    Entorno       : ${config.env}`);
  logger.raw(`    Servidor      : ${url}`);
  logger.raw(`    API           : ${url}${config.server.apiPrefix}`);
  logger.raw(`    Estado        : ${url}${config.server.apiPrefix}/health`);
  logger.raw(`    Frontend      : ${config.frontend.serve ? url : 'deshabilitado'}`);
  logger.raw(`    Socket.IO     : ${url} (mismo puerto)`);
  if (httpsServer) {
    logger.raw(`    HTTPS         : https://localhost:${config.server.httpsPort}`);
  }
  logger.raw(`    PostgreSQL    : ${config.database.host}:${config.database.port}/${config.database.name}`);
  logger.raw(`    Base de datos : ${dbLine}`);
  logger.raw('  ===========================================================');

  // Desde el telefono hay que usar la IP del equipo, no localhost.
  if (lanAddress) {
    const port = httpsServer ? config.server.httpsPort : config.server.port;
    const scheme = httpsServer ? 'https' : 'http';
    const mobileUrl = `${scheme}://${lanAddress}:${port}/app/index.html`;

    logger.raw(`    Desde el movil (misma Wi-Fi) : ${mobileUrl}`);
    logger.raw('    (con localhost el telefono se busca a si mismo y falla)');

    if (httpsServer) {
      logger.raw('    La primera vez el telefono avisara que el certificado no');
      logger.raw('    es de confianza: Configuracion avanzada -> Continuar.');
      logger.raw('    Es lo normal, el certificado lo firma este proyecto.');

      if (certTools && !certTools.certCoversAddress(lanAddress)) {
        logger.raw('');
        logger.raw(`    AVISO: el certificado no cubre ${lanAddress} (cambiaste de red).`);
        logger.raw('           Regeneralo con:  npm run cert');
      }
    } else {
      logger.raw('');
      logger.raw('    El GPS NO funcionara con http:// desde el movil.');
      logger.raw('    Para habilitarlo:  npm run cert   y vuelve a arrancar.');
    }

    logger.raw('  ===========================================================');
  }

  logger.raw('');
}

async function start() {
  // 1. Configuracion
  const envCheck = validateEnv();
  if (!envCheck.ok) {
    logger.warn(envCheck.message);
    logger.warn('Copia backend/.env.example a backend/.env y completa los valores.');
  }

  // 2. Notificaciones push (opcional: si no hay claves, el sistema sigue
  //    funcionando con la bandeja interna y Socket.IO)
  pushService.init();

  // 3. Base de datos (no detiene el arranque: /api/health reporta el estado)
  const databaseStatus = await checkConnection();
  if (!databaseStatus.connected) {
    logger.warn('El servidor arrancara sin base de datos. Levantala con: npm run db:up');
  }

  // 4. Servidor HTTPS (opcional): mismo Express y mismo Socket.IO, otro puerto
  if (config.server.httpsEnabled) {
    certTools = require('../scripts/make-cert');
    const credentials = certTools.loadCert();

    if (credentials) {
      httpsServer = https.createServer(credentials, app);
      // Un unico Socket.IO atendiendo los dos puertos: los clientes que entran
      // por HTTP y los que entran por HTTPS comparten salas y eventos.
      io.attach(httpsServer);

      httpsServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn(
            `El puerto ${config.server.httpsPort} ya esta en uso: el sistema seguira solo con HTTP. ` +
              'Cambia HTTPS_PORT en backend/.env'
          );
          httpsServer = null;
          return;
        }
        throw error;
      });

      httpsServer.listen(config.server.httpsPort, config.server.host);
    } else {
      logger.warn('Sin certificado HTTPS. Generalo con: npm run cert');
    }
  }

  // 5. Servidor HTTP
  server.listen(config.server.port, config.server.host, () => {
    printBanner(databaseStatus);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`El puerto ${config.server.port} ya esta en uso. Cambia PORT en backend/.env`);
      process.exit(1);
    }
    throw error;
  });
}

/** Apagado ordenado: deja de aceptar conexiones y cierra el pool. */
function shutdown(signal) {
  logger.info(`Senal ${signal} recibida. Cerrando el servidor...`);

  const forceExit = setTimeout(() => {
    logger.error('Cierre forzado tras 10 segundos de espera');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  // Se cierran primero los sockets: si no, las conexiones abiertas mantienen
  // vivo el servidor HTTP y server.close() nunca llega a completarse.
  io.close();
  if (httpsServer) httpsServer.close();

  server.close(async () => {
    try {
      await closePool();
    } catch (error) {
      logger.error('Error al cerrar el pool de PostgreSQL', error);
    }
    logger.info('Servidor detenido correctamente');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada sin manejar', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Excepcion no capturada. El proceso se detendra.', error);
  process.exit(1);
});

start();

module.exports = server;
