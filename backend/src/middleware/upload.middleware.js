/**
 * Subida de fotografias de las emergencias (multer).
 *
 * Almacenamiento LOCAL en backend/uploads/emergencias. La ruta publica se sirve
 * desde /uploads (ver app.js).
 *
 * Preparado para produccion: el nombre del archivo y la ruta publica se calculan
 * en un solo lugar, asi que cambiar a S3 o Cloudinary consiste en reemplazar el
 * "storage" de multer sin tocar los controladores.
 *
 * Tres medidas de seguridad:
 *   1. El nombre original del usuario NUNCA se usa como nombre de archivo: se
 *      genera uno aleatorio. Evita rutas tipo "../../.env" y colisiones.
 *   2. Se valida el tipo MIME contra la lista blanca de la configuracion.
 *   3. Se limita el tamano y la cantidad de archivos.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { config } = require('../config/env');
const ApiError = require('../utils/ApiError');

// Carpeta fisica donde se guardan los archivos.
const UPLOAD_DIR = path.resolve(__dirname, '../..', config.storage.uploadDir);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Extension segura deducida del tipo MIME, no del nombre que envio el cliente. */
const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/aac': '.aac',
};

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, UPLOAD_DIR);
  },
  filename(req, file, callback) {
    const unique = crypto.randomBytes(16).toString('hex');
    // El navegador puede mandar el codec pegado al mimetype (p. ej.
    // "audio/webm;codecs=opus"): se ignora para buscar la extension.
    const baseMimeType = file.mimetype.split(';')[0].trim();
    const extension = EXTENSION_BY_MIME[baseMimeType] || '.bin';
    callback(null, `ers-${Date.now()}-${unique}${extension}`);
  },
});

/**
 * Solo se aceptan los tipos MIME declarados en la configuracion.
 * El campo "audio" tiene su propia lista blanca: los navegadores no
 * coinciden en que formato graba MediaRecorder (Chrome usa webm, Safari mp4).
 * Se compara solo la parte antes del ";" porque el navegador suele mandar el
 * mimetype con el codec pegado, por ejemplo "audio/webm;codecs=opus".
 */
function fileFilter(req, file, callback) {
  const baseMimeType = file.mimetype.split(';')[0].trim();

  const allowed = file.fieldname === 'audio'
    ? config.storage.allowedAudioMimeTypes
    : config.storage.allowedMimeTypes;

  if (allowed.includes(baseMimeType)) {
    return callback(null, true);
  }
  return callback(
    ApiError.badRequest(
      `Tipo de archivo no permitido: ${file.mimetype}. Permitidos: ${allowed.join(', ')}`
    )
  );
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxFileSizeBytes,
    files: config.storage.maxFilesPerEmergency + 1,
  },
});

/** Middleware listo para usar: campo "photos", varias imagenes. */
const uploadEmergencyPhotos = upload.array('photos', config.storage.maxFilesPerEmergency);

/**
 * Middleware del reporte inicial: fotos y, opcionalmente, una nota de voz.
 * Van en campos separados porque cada uno valida un tipo MIME distinto.
 */
const uploadEmergencyReport = upload.fields([
  { name: 'photos', maxCount: config.storage.maxFilesPerEmergency },
  { name: 'audio', maxCount: 1 },
]);

/**
 * Convierte un archivo de multer en la fila que espera la tabla photos.
 * Centralizado aqui para que el dia que se cambie a almacenamiento externo
 * solo haya que tocar esta funcion.
 */
function toPhotoRecord(file, userId) {
  return {
    file_name: file.filename,
    file_path: `/uploads/emergencies/${file.filename}`,
    mime_type: file.mimetype,
    size_bytes: file.size,
    uploaded_by: userId,
  };
}

/**
 * Borra del disco los archivos ya subidos. Se usa si la transaccion falla.
 *
 * `req.files` tiene una forma distinta segun el middleware: un arreglo con
 * upload.array() (fotos sueltas) o un objeto {campo: [archivos]} con
 * upload.fields() (el reporte inicial, fotos + audio). Se aceptan las dos.
 */
function removeUploadedFiles(files = []) {
  const list = Array.isArray(files) ? files : Object.values(files || {}).flat();

  list.forEach((file) => {
    fs.rm(file.path, { force: true }, () => {
      // Si no se puede borrar, no se interrumpe la respuesta al usuario.
    });
  });
}

module.exports = {
  uploadEmergencyPhotos,
  uploadEmergencyReport,
  toPhotoRecord,
  removeUploadedFiles,
  UPLOAD_DIR,
};
