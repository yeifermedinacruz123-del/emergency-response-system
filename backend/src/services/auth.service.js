/**
 * Reglas de autenticacion.
 *
 * Decisiones de seguridad aplicadas aqui:
 *   - Las contrasenas se guardan con bcrypt (12 rondas por defecto). Jamas en claro.
 *   - Al fallar el login se responde SIEMPRE el mismo mensaje, exista o no el
 *     correo: si se dijera "ese correo no existe" se regalaria una lista de
 *     usuarios validos a quien pruebe correos al azar.
 *   - El registro publico crea siempre un CIUDADANO. Los demas roles solo los
 *     puede crear un administrador desde /api/users.
 *   - Cambiar la contrasena revoca todas las sesiones abiertas.
 */

'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { config } = require('../config/env');
const { ROLES, AUDIT_ACTIONS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const jwtUtils = require('../utils/jwt');
const userModel = require('../models/user.model');
const catalogModel = require('../models/catalog.model');
const refreshTokenModel = require('../models/refreshToken.model');
const passwordResetModel = require('../models/passwordReset.model');
const auditModel = require('../models/audit.model');
const credentialsService = require('./credentials.service');
const mailerService = require('./mailer.service');

/** El enlace de recuperacion vale 30 minutos: vive lo justo para revisar el correo. */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Quita el hash antes de devolver un usuario por la API. */
function sanitise(user) {
  if (!user) return null;
  const { password_hash: _passwordHash, ...safe } = user;
  return safe;
}

/**
 * Emite el par de tokens y registra el de refresco para poder revocarlo.
 * @param {object} user
 * @param {import('express').Request} [req]
 */
async function issueTokens(user, req = null) {
  const accessToken = jwtUtils.signAccessToken(user);
  const refreshToken = jwtUtils.signRefreshToken(user);

  await refreshTokenModel.create({
    userId: user.id,
    tokenHash: jwtUtils.hashToken(refreshToken),
    expiresAt: jwtUtils.getExpiration(refreshToken),
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 200) : null,
    ipAddress: req ? req.ip : null,
  });

  return { accessToken, refreshToken };
}

/** Registro publico. Siempre crea un ciudadano. */
async function register(data, req) {
  if (await userModel.emailExists(data.email)) {
    throw ApiError.conflict('Ya existe una cuenta con ese correo electronico', {
      errors: [{ field: 'email', message: 'Este correo ya esta registrado' }],
    });
  }

  if (await userModel.documentExists(data.documentNumber)) {
    throw ApiError.conflict('Ya existe una cuenta con ese numero de documento', {
      errors: [{ field: 'documentNumber', message: 'Este documento ya esta registrado' }],
    });
  }

  const role = await catalogModel.findRoleByCode(ROLES.CIUDADANO);
  if (!role) throw ApiError.internal('El catalogo de roles no esta cargado');

  const passwordHash = await bcrypt.hash(data.password, config.security.bcryptSaltRounds);

  const user = await userModel.create({
    role_id: role.id,
    first_name: data.firstName,
    last_name: data.lastName,
    document_type: data.documentType,
    document_number: data.documentNumber,
    email: data.email,
    phone: data.phone,
    address: data.address,
    password_hash: passwordHash,
  });

  const tokens = await issueTokens(user, req);
  await userModel.touchLastLogin(user.id);

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.CREAR,
      entity: 'users',
      entityId: user.id,
      description: 'Registro de un nuevo ciudadano',
    },
    req
  );

  // Se anota tambien en la hoja de accesos para que la lista quede completa:
  // si no, un ciudadano registrado desde la web apareceria sin contrasena.
  await credentialsService.record(user.email, data.password, 'SELF');

  return { user: sanitise(user), ...tokens };
}

/** Inicio de sesion. */
async function login(email, password, req) {
  const user = await userModel.findByEmailWithPassword(email);

  // Mismo mensaje para correo inexistente y contrasena incorrecta.
  const invalidCredentials = ApiError.unauthorized('Correo o contrasena incorrectos');

  if (!user) {
    await auditModel.record(
      {
        userId: null,
        action: AUDIT_ACTIONS.LOGIN_FALLIDO,
        entity: 'users',
        description: `Intento de acceso con un correo no registrado: ${email}`,
      },
      req
    );
    throw invalidCredentials;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    await auditModel.record(
      {
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FALLIDO,
        entity: 'users',
        entityId: user.id,
        description: 'Contrasena incorrecta',
      },
      req
    );
    throw invalidCredentials;
  }

  if (!user.is_active) {
    throw ApiError.forbidden('Tu cuenta esta desactivada. Comunicate con el administrador.');
  }

  const tokens = await issueTokens(user, req);
  await userModel.touchLastLogin(user.id);

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      entity: 'users',
      entityId: user.id,
      description: 'Inicio de sesion correcto',
    },
    req
  );

  return { user: sanitise(user), ...tokens };
}

/**
 * Renueva el token de acceso.
 * Se aplica ROTACION: el token de refresco usado se revoca y se entrega uno
 * nuevo. Si alguien robara un token de refresco, solo le serviria una vez.
 */
async function refresh(refreshToken, req) {
  if (!refreshToken) throw ApiError.unauthorized('Falta el token de refresco');

  let payload;
  try {
    payload = jwtUtils.verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('El token de refresco no es valido o expiro');
  }

  const tokenHash = jwtUtils.hashToken(refreshToken);
  const stored = await refreshTokenModel.findValid(tokenHash);
  if (!stored) throw ApiError.unauthorized('La sesion fue cerrada o expiro');

  const user = await userModel.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('La cuenta ya no existe');
  if (!user.is_active) throw ApiError.forbidden('Tu cuenta esta desactivada');

  await refreshTokenModel.revoke(tokenHash);
  const tokens = await issueTokens(user, req);

  return { user: sanitise(user), ...tokens };
}

/** Cierra la sesion revocando el token de refresco. */
async function logout(refreshToken, userId, req) {
  if (refreshToken) {
    await refreshTokenModel.revoke(jwtUtils.hashToken(refreshToken));
  }

  await auditModel.record(
    {
      userId,
      action: AUDIT_ACTIONS.LOGOUT,
      entity: 'users',
      entityId: userId,
      description: 'Cierre de sesion',
    },
    req
  );
}

/** Perfil del usuario autenticado. */
async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw ApiError.notFound('Usuario no encontrado');
  return sanitise(user);
}

/** Actualiza los datos propios. El rol NO se puede cambiar desde aqui. */
async function updateProfile(userId, data, req) {
  if (data.email && (await userModel.emailExists(data.email, userId))) {
    throw ApiError.conflict('Ese correo ya esta en uso', {
      errors: [{ field: 'email', message: 'Este correo ya esta registrado' }],
    });
  }

  const updated = await userModel.update(userId, {
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone,
    address: data.address,
  });

  await auditModel.record(
    {
      userId,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'users',
      entityId: userId,
      description: 'Actualizacion del perfil propio',
    },
    req
  );

  return sanitise(updated);
}

/** Cambio de contrasena. Exige la actual y revoca todas las sesiones. */
async function changePassword(userId, currentPassword, newPassword, req) {
  const currentHash = await userModel.getPasswordHash(userId);
  if (!currentHash) throw ApiError.notFound('Usuario no encontrado');

  const matches = await bcrypt.compare(currentPassword, currentHash);
  if (!matches) {
    throw ApiError.badRequest('La contrasena actual no es correcta', {
      errors: [{ field: 'currentPassword', message: 'Contrasena incorrecta' }],
    });
  }

  const newHash = await bcrypt.hash(newPassword, config.security.bcryptSaltRounds);
  await userModel.updatePassword(userId, newHash);

  // Cambiar la clave invalida las sesiones abiertas en otros dispositivos.
  const revoked = await refreshTokenModel.revokeAllForUser(userId);

  await auditModel.record(
    {
      userId,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'users',
      entityId: userId,
      description: `Cambio de contrasena. Sesiones cerradas: ${revoked}`,
    },
    req
  );

  return { revokedSessions: revoked };
}

/**
 * Pide un enlace de recuperacion.
 *
 * Siempre responde lo mismo, exista o no la cuenta: si dijera "ese correo no
 * existe" regalaria una lista de correos validos a quien probara al azar,
 * igual que en login().
 */
async function forgotPassword(email, req) {
  const user = await userModel.findByEmail(email);

  if (user && user.is_active) {
    await passwordResetModel.invalidateAllForUser(user.id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    await passwordResetModel.create({
      userId: user.id,
      tokenHash: jwtUtils.hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    const link = `${origin}/reset-password.html?token=${rawToken}`;

    /*
     * No se espera al envio, igual que en el aviso a los contactos de
     * confianza al activar un SOS.
     *
     * El enlace ya esta guardado en la base de datos: lo unico que falta es
     * entregarlo, y eso puede tardar segundos o fallar sin que la persona que
     * pulso el boton tenga nada que hacer al respecto. Esperando, un servidor
     * de correo lento dejaba la peticion colgada dos minutos.
     *
     * `sendMail` nunca lanza (registra el fallo y devuelve el motivo), asi que
     * no hace falta un catch aqui.
     */
    mailerService.sendMail({
      to: user.email,
      subject: 'Recupera tu contrasena · Emergency Response System',
      text:
        `Hola ${user.first_name},\n\n` +
        'Pediste recuperar tu contrasena. Este enlace vale 30 minutos:\n\n' +
        `${link}\n\n` +
        'Si no fuiste tu, ignora este correo: tu contrasena sigue igual.',
      html:
        `<p>Hola ${user.first_name},</p>` +
        '<p>Pediste recuperar tu contrasena. Este enlace vale 30 minutos:</p>' +
        `<p><a href="${link}">${link}</a></p>` +
        '<p>Si no fuiste tu, ignora este correo: tu contrasena sigue igual.</p>',
    });

    await auditModel.record(
      {
        userId: user.id,
        action: AUDIT_ACTIONS.ACTUALIZAR,
        entity: 'users',
        entityId: user.id,
        description: 'Solicito un enlace de recuperacion de contrasena',
      },
      req
    );
  }

  return {
    message: 'Si el correo esta registrado, te enviamos un enlace para recuperar tu contrasena.',
  };
}

/** Cambia la contrasena a partir de un token de recuperacion valido. */
async function resetPassword(token, newPassword, req) {
  const tokenHash = jwtUtils.hashToken(token);
  const stored = await passwordResetModel.findValid(tokenHash);

  if (!stored) {
    throw ApiError.badRequest('El enlace no es valido o ya expiro. Pide uno nuevo.');
  }

  const newHash = await bcrypt.hash(newPassword, config.security.bcryptSaltRounds);
  await userModel.updatePassword(stored.user_id, newHash);
  await passwordResetModel.markUsed(stored.id);

  // Igual que un cambio de contrasena normal: cierra las sesiones abiertas.
  const revoked = await refreshTokenModel.revokeAllForUser(stored.user_id);

  await auditModel.record(
    {
      userId: stored.user_id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'users',
      entityId: stored.user_id,
      description: `Contrasena restablecida por enlace de recuperacion. Sesiones cerradas: ${revoked}`,
    },
    req
  );

  return { revokedSessions: revoked };
}

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
  sanitise,
};
