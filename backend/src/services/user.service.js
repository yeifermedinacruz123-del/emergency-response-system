/**
 * Gestion de usuarios (solo administrador).
 *
 * Incluye dos salvaguardas que evitan dejar el sistema sin control:
 *   - Un administrador no puede desactivarse, cambiarse el rol ni borrarse a si
 *     mismo (se quedaria fuera sin poder volver a entrar).
 *   - No se puede eliminar ni degradar al ULTIMO administrador activo.
 */

'use strict';

const bcrypt = require('bcryptjs');

const { config } = require('../config/env');
const { ROLES, AUDIT_ACTIONS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination');

const userModel = require('../models/user.model');
const catalogModel = require('../models/catalog.model');
const refreshTokenModel = require('../models/refreshToken.model');
const auditModel = require('../models/audit.model');
const credentialsService = require('./credentials.service');

/** Listado con busqueda, filtro por rol y por estado. */
async function list(query = {}) {
  const pagination = getPagination(query);

  const filters = {
    search: query.search || null,
    role: query.role || null,
    isActive:
      query.active === 'true' ? true : query.active === 'false' ? false : null,
  };

  const { items, total } = await userModel.list(filters, pagination, query);
  return { items, meta: buildMeta(pagination, total) };
}

/** Detalle. */
async function getById(id) {
  const user = await userModel.findById(id);
  if (!user) throw ApiError.notFound('El usuario no existe');
  return user;
}

/** Impide que un administrador se modifique a si mismo en acciones peligrosas. */
function assertNotSelf(targetId, actor, action) {
  if (Number(targetId) === actor.id) {
    throw ApiError.badRequest(`No puedes ${action} tu propia cuenta`);
  }
}

/** Impide quedarse sin ningun administrador activo. */
async function assertNotLastAdmin(targetUser) {
  if (targetUser.role_code !== ROLES.ADMINISTRADOR || !targetUser.is_active) return;

  const activeAdmins = await userModel.countByRole(ROLES.ADMINISTRADOR);
  if (activeAdmins <= 1) {
    throw ApiError.badRequest(
      'Es el unico administrador activo del sistema. Crea o activa otro antes de continuar.'
    );
  }
}

/** Crea un usuario con cualquier rol. */
async function create(data, actor, req) {
  if (await userModel.emailExists(data.email)) {
    throw ApiError.conflict('Ya existe un usuario con ese correo', {
      errors: [{ field: 'email', message: 'Este correo ya esta registrado' }],
    });
  }

  if (await userModel.documentExists(data.documentNumber)) {
    throw ApiError.conflict('Ya existe un usuario con ese documento', {
      errors: [{ field: 'documentNumber', message: 'Este documento ya esta registrado' }],
    });
  }

  const role = await catalogModel.findRoleByCode(data.role);
  if (!role) {
    throw ApiError.validation([{ field: 'role', message: `Rol no valido: ${data.role}` }]);
  }

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
    is_active: data.isActive,
  });

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREAR,
      entity: 'users',
      entityId: user.id,
      description: `Creacion del usuario ${user.email} con rol ${role.code}`,
    },
    req
  );

  // Hoja de accesos de demostracion. `record` no lanza nunca: si la hoja falla,
  // el usuario ya esta creado y eso es lo que importa. El error queda en el log.
  await credentialsService.record(user.email, data.password, 'ADMIN');

  return user;
}

/** Actualiza los datos de un usuario. */
async function update(id, data, actor, req) {
  const existing = await getById(id);

  if (data.email && (await userModel.emailExists(data.email, id))) {
    throw ApiError.conflict('Ese correo ya esta en uso por otro usuario', {
      errors: [{ field: 'email', message: 'Este correo ya esta registrado' }],
    });
  }

  if (data.documentNumber && (await userModel.documentExists(data.documentNumber, id))) {
    throw ApiError.conflict('Ese documento ya esta en uso por otro usuario', {
      errors: [{ field: 'documentNumber', message: 'Este documento ya esta registrado' }],
    });
  }

  let roleId;
  if (data.role && data.role !== existing.role_code) {
    assertNotSelf(id, actor, 'cambiar el rol de');
    await assertNotLastAdmin(existing);

    const role = await catalogModel.findRoleByCode(data.role);
    if (!role) {
      throw ApiError.validation([{ field: 'role', message: `Rol no valido: ${data.role}` }]);
    }
    roleId = role.id;
  }

  const updated = await userModel.update(id, {
    first_name: data.firstName,
    last_name: data.lastName,
    document_type: data.documentType,
    document_number: data.documentNumber,
    email: data.email,
    phone: data.phone,
    address: data.address,
    role_id: roleId,
  });

  // Cambiar el rol invalida las sesiones: el token viejo lleva el rol anterior.
  if (roleId) await refreshTokenModel.revokeAllForUser(id);

  await auditModel.record(
    {
      userId: actor.id,
      action: roleId ? AUDIT_ACTIONS.CAMBIO_ROL : AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'users',
      entityId: id,
      description: roleId
        ? `Rol de ${updated.email}: ${existing.role_code} -> ${data.role}`
        : `Actualizacion del usuario ${updated.email}`,
    },
    req
  );

  return updated;
}

/** Activa o desactiva la cuenta. */
async function setActive(id, isActive, actor, req) {
  const existing = await getById(id);

  if (!isActive) {
    assertNotSelf(id, actor, 'desactivar');
    await assertNotLastAdmin(existing);
  }

  const updated = await userModel.setActive(id, isActive);

  // Al desactivar se cierran sus sesiones abiertas de inmediato.
  if (!isActive) await refreshTokenModel.revokeAllForUser(id);

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'users',
      entityId: id,
      description: `${isActive ? 'Activacion' : 'Desactivacion'} del usuario ${updated.email}`,
    },
    req
  );

  return updated;
}

/** Cambia unicamente el rol. */
async function setRole(id, roleCode, actor, req) {
  const existing = await getById(id);
  assertNotSelf(id, actor, 'cambiar el rol de');

  if (existing.role_code === roleCode) {
    throw ApiError.badRequest(`El usuario ya tiene el rol ${roleCode}`);
  }

  await assertNotLastAdmin(existing);

  const role = await catalogModel.findRoleByCode(roleCode);
  if (!role) {
    throw ApiError.validation([{ field: 'role', message: `Rol no valido: ${roleCode}` }]);
  }

  const updated = await userModel.setRole(id, role.id);
  await refreshTokenModel.revokeAllForUser(id);

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.CAMBIO_ROL,
      entity: 'users',
      entityId: id,
      description: `Rol de ${updated.email}: ${existing.role_code} -> ${roleCode}`,
    },
    req
  );

  return updated;
}

/**
 * Elimina un usuario.
 * Si tiene emergencias reportadas, PostgreSQL lo impide (ON DELETE RESTRICT) y
 * se responde con una explicacion util en lugar de un error tecnico.
 */
async function remove(id, actor, req) {
  const existing = await getById(id);
  assertNotSelf(id, actor, 'eliminar');
  await assertNotLastAdmin(existing);

  try {
    await userModel.remove(id);
  } catch (error) {
    if (error.code === '23503') {
      throw ApiError.conflict(
        'No se puede eliminar: el usuario tiene emergencias o registros asociados. ' +
          'Desactivalo en lugar de eliminarlo para conservar el historial.'
      );
    }
    throw error;
  }

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.ELIMINAR,
      entity: 'users',
      entityId: id,
      description: `Eliminacion del usuario ${existing.email}`,
    },
    req
  );

  // La hoja dice reflejar la base, asi que un usuario borrado tiene que
  // desaparecer de ella y no solo dejar de aparecer en la proxima descarga.
  await credentialsService.regenerate();

  return { id: Number(id), email: existing.email, deleted: true };
}

module.exports = { list, getById, create, update, setActive, setRole, remove };
