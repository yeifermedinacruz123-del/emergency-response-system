/**
 * Genera el certificado autofirmado que usa el servidor HTTPS local.
 *
 * Por que hace falta: el navegador solo entrega el GPS, la camara y el service
 * worker a un "contexto seguro", es decir HTTPS o localhost. Desde el telefono
 * la aplicacion se abre por la IP de la red (http://192.168.x.x:4000), que no
 * es ninguna de las dos cosas, y Chrome bloquea la ubicacion sin ni siquiera
 * preguntar. Con este certificado el mismo servidor tambien escucha en HTTPS y
 * el telefono si recibe el cuadro de permiso.
 *
 * El certificado lo firma el propio proyecto, asi que el navegador mostrara un
 * aviso la primera vez ("Tu conexion no es privada" -> Configuracion avanzada
 * -> Continuar). Es lo esperado: nadie externo puede firmar un certificado para
 * una direccion privada como 192.168.x.x.
 *
 * Uso:  npm run cert        (rehace el certificado si cambio la IP)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const selfsigned = require('selfsigned');

const CERT_DIR = path.resolve(__dirname, '../certs');
const KEY_FILE = path.join(CERT_DIR, 'server.key');
const CRT_FILE = path.join(CERT_DIR, 'server.crt');

/** Todas las IPv4 de la maquina que no son internas (192.168.x.x, 10.x.x.x...). */
function localAddresses() {
  const found = [];

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) found.push(address.address);
    }
  }

  return found;
}

async function build() {
  const ips = localAddresses();

  /*
   * El navegador ya no mira el "Common Name": exige que la direccion aparezca
   * en subjectAltName. Por eso se listan localhost, 127.0.0.1 y cada IP de la
   * red local: asi el mismo certificado sirve en el computador y en el movil.
   */
  const altNames = [
    { type: 2, value: 'localhost' }, // 2 = DNS
    { type: 7, ip: '127.0.0.1' }, // 7 = IP
    ...ips.map((ip) => ({ type: 7, ip })),
  ];

  const attributes = [{ name: 'commonName', value: 'localhost' }];

  // selfsigned 5.x devuelve una promesa.
  const pems = await selfsigned.generate(attributes, {
    days: 825, // maximo que aceptan los navegadores para un certificado de servidor
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });

  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, pems.private, { encoding: 'utf8' });
  fs.writeFileSync(CRT_FILE, pems.cert, { encoding: 'utf8' });

  console.log('');
  console.log('  Certificado HTTPS generado.');
  console.log(`    Clave       : ${KEY_FILE}`);
  console.log(`    Certificado : ${CRT_FILE}`);
  console.log(`    Valido para : localhost, 127.0.0.1${ips.length ? ', ' + ips.join(', ') : ''}`);
  console.log('');
  console.log('  Arranca el servidor con:  npm run dev');
  console.log('');

  if (ips.length === 0) {
    console.log('  AVISO: no se detecto ninguna red local. Conectate al Wi-Fi y');
    console.log('         vuelve a ejecutar  npm run cert.');
    console.log('');
  }
}

/**
 * @returns {{key: Buffer, cert: Buffer}|null} El certificado ya generado, o
 *   null si todavia no existe (el servidor arranca solo con HTTP).
 */
function loadCert() {
  if (!fs.existsSync(KEY_FILE) || !fs.existsSync(CRT_FILE)) return null;

  return { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CRT_FILE) };
}

/**
 * Comprueba si el certificado cubre una direccion concreta. Sirve para avisar
 * cuando la IP del computador cambio (otro Wi-Fi) y el certificado quedo viejo.
 */
function certCoversAddress(address) {
  const cert = loadCert();
  if (!cert) return false;

  try {
    const { X509Certificate } = require('crypto');
    const subjectAltName = new X509Certificate(cert.cert).subjectAltName || '';
    return subjectAltName.includes(`IP Address:${address}`);
  } catch {
    return true; // Ante la duda no se molesta al usuario con un aviso falso.
  }
}

module.exports = { build, loadCert, certCoversAddress, CERT_DIR, KEY_FILE, CRT_FILE };

// Ejecutado directamente:  node scripts/make-cert.js
if (require.main === module) {
  build().catch((error) => {
    console.error('No se pudo generar el certificado:', error.message);
    process.exit(1);
  });
}
