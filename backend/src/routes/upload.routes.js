/**
 * Rutas de /uploads: fotografias y notas de voz de las emergencias.
 *
 * Antes era una carpeta estatica publica: quien tuviera el enlace podia abrir
 * la foto, sin sesion y para siempre. Ahora cada peticion exige la firma que
 * la API pone en la ruta (utils/uploadUrl.js), y esa firma solo se entrega a
 * quien puede ver la emergencia.
 *
 * El archivo sale de la base de datos (photos.content) o, si se subio con
 * STORAGE_PROVIDER=local, del disco.
 */

'use strict';

const path = require('path');
const { Router } = require('express');

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyUpload } = require('../utils/uploadUrl');
const photoModel = require('../models/photo.model');
const { UPLOAD_DIR } = require('../middleware/upload.middleware');

const router = Router();

/** Los nombres los genera el servidor: ers-<marca>-<32 hex>.<ext> */
const FILE_NAME = /^ers-\d+-[a-f0-9]{32}\.[a-z0-9]{2,4}$/;

router.get(
  '/emergencies/:fileName',
  asyncHandler(async (req, res, next) => {
    const { fileName } = req.params;
    if (!FILE_NAME.test(fileName)) throw ApiError.notFound('El archivo no existe');

    if (!verifyUpload(fileName, req.query.exp, req.query.sig)) {
      throw ApiError.forbidden('El enlace del archivo no es valido o ya vencio');
    }

    const file = await photoModel.findFile(fileName);
    if (!file) throw ApiError.notFound('El archivo no existe');

    // Privado: nunca en caches compartidas. Una hora en el navegador basta,
    // la firma misma cambia cada hora.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline');

    const mimeType = String(file.mime_type || 'application/octet-stream').split(';')[0].trim();

    if (file.content) {
      res.type(mimeType);
      return res.send(file.content);
    }

    return res.sendFile(path.join(UPLOAD_DIR, fileName), { headers: { 'Content-Type': mimeType } }, (error) => {
      if (error) next(ApiError.notFound('El archivo ya no esta disponible en el servidor'));
    });
  })
);

module.exports = router;
