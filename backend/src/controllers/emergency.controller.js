/**
 * Controladores de /api/emergencies
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const emergencyService = require('../services/emergency.service');
const { toPhotoRecord, removeUploadedFiles } = require('../middleware/upload.middleware');

/**
 * Convierte los archivos de multer en registros para la tabla photos.
 * Si algo falla despues, los archivos ya escritos en disco se borran para no
 * dejar basura huerfana.
 *
 * `req.files` tiene una forma distinta segun la ruta: un arreglo cuando el
 * campo es solo "photos" (upload.array), o un objeto {photos, audio} en el
 * reporte inicial (upload.fields). La nota de voz se guarda en la misma
 * tabla que las fotos: la fila ya es generica (nombre, ruta, tipo MIME,
 * tamano) y el tipo MIME es lo que distingue una foto de un audio al
 * mostrarlo despues.
 */
function buildPhotoRecords(req) {
  const files = Array.isArray(req.files)
    ? req.files
    : [...(req.files?.photos || []), ...(req.files?.audio || [])];

  return files.map((file) => toPhotoRecord(file, req.user.id));
}

/** GET /api/emergencies */
const list = asyncHandler(async (req, res) => {
  const { items, meta } = await emergencyService.list(req.query, req.user);
  return ApiResponse.paginated(res, items, meta, 'Emergencias obtenidas');
});

/** GET /api/emergencies/mine */
const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await emergencyService.listMine(req.query, req.user);
  return ApiResponse.paginated(res, items, meta, 'Tus emergencias');
});

/** GET /api/emergencies/assigned */
const listAssigned = asyncHandler(async (req, res) => {
  const { items, meta } = await emergencyService.listAssigned(req.query, req.user);
  return ApiResponse.paginated(res, items, meta, 'Emergencias asignadas');
});

/** GET /api/emergencies/map */
const map = asyncHandler(async (req, res) => {
  const data = await emergencyService.listForMap(req.query, req.user);
  return ApiResponse.ok(res, data, 'Datos del mapa');
});

/** GET /api/emergencies/:id */
const getById = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.getById(req.params.id, req.user);
  return ApiResponse.ok(res, emergency, 'Detalle de la emergencia');
});

/** GET /api/emergencies/:id/history */
const getHistory = asyncHandler(async (req, res) => {
  const history = await emergencyService.getHistory(req.params.id, req.user);
  return ApiResponse.ok(res, history, 'Historial de la emergencia');
});

/** POST /api/emergencies */
const create = asyncHandler(async (req, res) => {
  const photos = buildPhotoRecords(req);

  try {
    const emergency = await emergencyService.create(req.body, photos, req.user, req);
    return ApiResponse.created(res, emergency, `Emergencia ${emergency.code} registrada`);
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
});

/** POST /api/emergencies/sos */
const createSos = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.createSos(req.body, req.user, req);
  return ApiResponse.created(
    res,
    emergency,
    `SOS ${emergency.code} activado. El centro de control ya fue notificado.`
  );
});

/** PUT /api/emergencies/:id */
const update = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.update(req.params.id, req.body, req.user, req);
  return ApiResponse.ok(res, emergency, 'Emergencia actualizada');
});

/** PATCH /api/emergencies/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.changeStatus(
    req.params.id,
    req.body.status,
    { notes: req.body.notes, reason: req.body.reason },
    req.user,
    req
  );
  return ApiResponse.ok(res, emergency, `Estado cambiado a ${req.body.status}`);
});

/** PATCH /api/emergencies/:id/priority */
const changePriority = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.changePriority(
    req.params.id,
    req.body.priority,
    req.user,
    req
  );
  return ApiResponse.ok(res, emergency, `Prioridad cambiada a ${req.body.priority}`);
});

/** POST /api/emergencies/:id/assign */
const assign = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.assign(
    req.params.id,
    req.body.responderIds,
    req.body.notes,
    req.user,
    req
  );
  return ApiResponse.ok(res, emergency, 'Personal asignado correctamente');
});

/** DELETE /api/emergencies/:id/assign/:assignmentId */
const unassign = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.unassign(
    req.params.id,
    req.params.assignmentId,
    req.user,
    req
  );
  return ApiResponse.ok(res, emergency, 'Asignacion retirada');
});

/** POST /api/emergencies/:id/comments */
const addComment = asyncHandler(async (req, res) => {
  const entry = await emergencyService.addComment(req.params.id, req.body.text, req.user, req);
  return ApiResponse.created(res, entry, 'Avance registrado en el historial');
});

/** GET /api/emergencies/:id/messages */
const getMessages = asyncHandler(async (req, res) => {
  const messages = await emergencyService.listMessages(req.params.id, req.user);
  return ApiResponse.ok(res, messages, 'Mensajes del chat');
});

/** POST /api/emergencies/:id/messages */
const addMessage = asyncHandler(async (req, res) => {
  const message = await emergencyService.addMessage(req.params.id, req.user, req.body.message);
  return ApiResponse.created(res, message, 'Mensaje enviado');
});

/** POST /api/emergencies/:id/photos */
const addPhotos = asyncHandler(async (req, res) => {
  const photos = buildPhotoRecords(req);

  try {
    const saved = await emergencyService.addPhotos(req.params.id, photos, req.user, req);
    return ApiResponse.created(res, saved, 'Fotografias agregadas');
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
});

/** DELETE /api/emergencies/:id */
const remove = asyncHandler(async (req, res) => {
  const result = await emergencyService.remove(req.params.id, req.user, req);
  return ApiResponse.ok(res, result, `Emergencia ${result.code} eliminada`);
});

module.exports = {
  list,
  listMine,
  listAssigned,
  map,
  getById,
  getHistory,
  create,
  createSos,
  update,
  changeStatus,
  changePriority,
  assign,
  unassign,
  addComment,
  getMessages,
  addMessage,
  addPhotos,
  remove,
};
