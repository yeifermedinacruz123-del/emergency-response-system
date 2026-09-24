/**
 * Enlaces firmados para las fotografias y notas de voz.
 *
 * Un <img src> o un <audio src> no puede mandar la cabecera Authorization,
 * asi que los archivos no pueden protegerse con el mismo token que la API.
 * En su lugar, la API entrega cada ruta con una firma que caduca:
 *
 *   /uploads/emergencies/ers-...jpg?exp=1790000000&sig=Kq3...
 *
 * Solo recibe ese enlace quien puede ver la emergencia (la API ya lo
 * comprobo), y el servidor rechaza cualquier archivo pedido sin firma, con la
 * firma alterada o con la fecha vencida. Adivinar el nombre ya no basta, y un
 * enlace filtrado deja de servir a las pocas horas.
 *
 * La caducidad se redondea a la hora: todas las peticiones de una misma hora
 * reciben la misma URL, asi el navegador y el service worker pueden guardar
 * la imagen en cache en lugar de descargarla en cada visita.
 */

'use strict';

const crypto = require('crypto');
const { config } = require('../config/env');

/** Cuanto vale un enlace, como minimo, desde que se entrega. */
const VALID_HOURS = 6;

/** Clave propia de las firmas, derivada del secreto de la API. */
function signingKey() {
  return crypto.createHash('sha256').update(`ers-uploads:${config.jwt.secret}`).digest();
}

function signature(fileName, exp) {
  return crypto
    .createHmac('sha256', signingKey())
    .update(`${fileName}.${exp}`)
    .digest('base64url')
    .slice(0, 32);
}

/**
 * Agrega la firma a una ruta publica de /uploads.
 * @param {string} filePath  /uploads/emergencies/<archivo>
 */
function signUploadPath(filePath) {
  if (!filePath || !filePath.startsWith('/uploads/')) return filePath;

  const fileName = filePath.split('/').pop();
  const hour = Math.floor(Date.now() / 3600000);
  const exp = (hour + VALID_HOURS + 1) * 3600;

  return `${filePath}?exp=${exp}&sig=${signature(fileName, exp)}`;
}

/** true si la firma corresponde al archivo y todavia no vencio. */
function verifyUpload(fileName, exp, sig) {
  const expires = Number.parseInt(exp, 10);
  if (!fileName || !sig || Number.isNaN(expires)) return false;
  if (expires * 1000 < Date.now()) return false;

  const expected = Buffer.from(signature(fileName, expires));
  const received = Buffer.from(String(sig));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Firma la ruta de cada archivo de una lista de filas de la tabla photos. */
function signPhotos(photos = []) {
  return photos.map((photo) => ({ ...photo, file_path: signUploadPath(photo.file_path) }));
}

module.exports = { signUploadPath, verifyUpload, signPhotos };
