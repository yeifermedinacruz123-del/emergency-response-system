/**
 * Controladores de /api/auth
 *
 * Los controladores no tienen logica: leen la peticion, llaman al servicio y
 * arman la respuesta. Las reglas de negocio viven en services/auth.service.js.
 */

'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const authService = require('../services/auth.service');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, req);
  return ApiResponse.created(res, result, 'Cuenta creada correctamente');
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password, req);
  return ApiResponse.ok(res, result, `Bienvenido, ${result.user.first_name}`);
});

/** POST /api/auth/refresh */
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken, req);
  return ApiResponse.ok(res, result, 'Sesion renovada');
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken, req.user.id, req);
  return ApiResponse.ok(res, null, 'Sesion cerrada correctamente');
});

/** GET /api/auth/profile */
const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  return ApiResponse.ok(res, user, 'Perfil obtenido');
});

/** PUT /api/auth/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body, req);
  return ApiResponse.ok(res, user, 'Perfil actualizado correctamente');
});

/** PATCH /api/auth/password */
const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword,
    req
  );
  return ApiResponse.ok(
    res,
    result,
    'Contrasena actualizada. Vuelve a iniciar sesion en tus otros dispositivos.'
  );
});

/** POST /api/auth/forgot-password */
const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email, req);
  return ApiResponse.ok(res, result, result.message);
});

/** POST /api/auth/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword, req);
  return ApiResponse.ok(res, null, 'Contrasena restablecida. Ya puedes iniciar sesion.');
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};
