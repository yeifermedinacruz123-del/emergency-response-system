/**
 * Controladores de /api/users  (solo administrador)
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const userService = require('../services/user.service');
const credentialsService = require('../services/credentials.service');
const { config } = require('../config/env');

/** GET /api/users */
const list = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.list(req.query);
  return ApiResponse.paginated(res, items, meta, 'Usuarios obtenidos');
});

/** GET /api/users/:id */
const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return ApiResponse.ok(res, user, 'Detalle del usuario');
});

/** POST /api/users */
const create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body, req.user, req);
  return ApiResponse.created(res, user, `Usuario ${user.email} creado`);
});

/** PUT /api/users/:id */
const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body, req.user, req);
  return ApiResponse.ok(res, user, 'Usuario actualizado');
});

/** PATCH /api/users/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const user = await userService.setActive(req.params.id, req.body.isActive, req.user, req);
  return ApiResponse.ok(res, user, user.is_active ? 'Usuario activado' : 'Usuario desactivado');
});

/** PATCH /api/users/:id/role */
const changeRole = asyncHandler(async (req, res) => {
  const user = await userService.setRole(req.params.id, req.body.role, req.user, req);
  return ApiResponse.ok(res, user, `Rol cambiado a ${user.role_name}`);
});

/** DELETE /api/users/:id */
const remove = asyncHandler(async (req, res) => {
  const result = await userService.remove(req.params.id, req.user, req);
  return ApiResponse.ok(res, result, 'Usuario eliminado');
});

/**
 * GET /api/users/credentials.xlsx
 * Descarga la hoja de accesos de demostracion. Se genera al vuelo para que
 * refleje la base aunque el archivo de disco no exista todavia.
 */
const downloadCredentials = asyncHandler(async (req, res) => {
  if (!config.credentials.enabled) {
    throw ApiError.notFound('La hoja de credenciales esta desactivada en este servidor');
  }

  const buffer = await credentialsService.buildBuffer();

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${credentialsService.DOWNLOAD_NAME}"`
  );
  res.setHeader('Content-Length', buffer.byteLength);
  // Nunca se cachea: cambia cada vez que se crea un usuario.
  res.setHeader('Cache-Control', 'no-store');

  return res.end(Buffer.from(buffer));
});

module.exports = {
  list,
  getById,
  create,
  update,
  changeStatus,
  changeRole,
  remove,
  downloadCredentials,
};
