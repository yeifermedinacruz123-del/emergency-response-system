/**
 * Gestion del personal de emergencia.
 *
 * Una unidad (responder) siempre esta ligada a un usuario con rol PERSONAL:
 * el usuario es "quien inicia sesion" y la unidad es "que recurso opera".
 */

'use strict';

const {
  ROLES,
  RESPONDER_STATUS,
  RESPONDER_TYPES,
  AUDIT_ACTIONS,
} = require('../config/constants');

const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination');

const responderModel = require('../models/responder.model');
const userModel = require('../models/user.model');
const assignmentModel = require('../models/assignment.model');
const auditModel = require('../models/audit.model');
const realtime = require('../sockets/realtime');

/** Listado con filtros por tipo y estado. */
async function list(query = {}) {
  const pagination = getPagination(query);

  const filters = {
    type: query.type || null,
    status: query.status || null,
    search: query.search || null,
    isActive: query.active === 'false' ? false : query.active === 'true' ? true : null,
  };

  const { items, total } = await responderModel.list(filters, pagination, query);
  return { items, meta: buildMeta(pagination, total) };
}

/** Detalle de una unidad. */
async function getById(id) {
  const responder = await responderModel.findById(id);
  if (!responder) throw ApiError.notFound('La unidad de personal no existe');
  return responder;
}

/** Ficha del personal autenticado. */
async function getOwnProfile(user) {
  const responder = await responderModel.findByUserId(user.id);
  if (!responder) {
    throw ApiError.notFound('Tu usuario no tiene una ficha de personal asociada');
  }
  return responder;
}

/**
 * Unidades disponibles para asignar.
 * Con ?lat= y ?lng= se ordenan por cercania al lugar de la emergencia.
 */
async function findAvailable(query = {}) {
  const latitude = query.lat !== undefined ? Number.parseFloat(query.lat) : null;
  const longitude = query.lng !== undefined ? Number.parseFloat(query.lng) : null;

  const hasValidPoint =
    latitude !== null &&
    longitude !== null &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude);

  return responderModel.findAvailable({
    type: query.type || null,
    latitude: hasValidPoint ? latitude : null,
    longitude: hasValidPoint ? longitude : null,
    limit: query.limit ? Number.parseInt(query.limit, 10) : 20,
  });
}

/** Crea la ficha de personal para un usuario existente. */
async function create(data, actor, req) {
  const user = await userModel.findById(data.userId);
  if (!user) {
    throw ApiError.validation([{ field: 'userId', message: 'El usuario indicado no existe' }]);
  }

  if (user.role_code !== ROLES.PERSONAL) {
    throw ApiError.validation([
      {
        field: 'userId',
        message: `El usuario tiene rol ${user.role_code}. Debe tener rol ${ROLES.PERSONAL}.`,
      },
    ]);
  }

  if (await responderModel.userHasProfile(data.userId)) {
    throw ApiError.conflict('Ese usuario ya tiene una ficha de personal');
  }

  if (await responderModel.unitCodeExists(data.unitCode)) {
    throw ApiError.conflict('Ya existe una unidad con ese codigo', {
      errors: [{ field: 'unitCode', message: 'Codigo de unidad duplicado' }],
    });
  }

  const responder = await responderModel.create({
    user_id: data.userId,
    responder_type: data.responderType,
    unit_code: data.unitCode,
    unit_name: data.unitName,
    institution: data.institution,
    status: data.status,
  });

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREAR,
      entity: 'responders',
      entityId: responder.id,
      description: `Creacion de la unidad ${responder.unit_code} (${responder.responder_type})`,
    },
    req
  );

  return responder;
}

/** Actualiza la ficha. */
async function update(id, data, actor, req) {
  await getById(id);

  if (data.unitCode && (await responderModel.unitCodeExists(data.unitCode, id))) {
    throw ApiError.conflict('Ya existe otra unidad con ese codigo', {
      errors: [{ field: 'unitCode', message: 'Codigo de unidad duplicado' }],
    });
  }

  const updated = await responderModel.update(id, {
    responder_type: data.responderType,
    unit_code: data.unitCode,
    unit_name: data.unitName,
    institution: data.institution,
    status: data.status,
    is_active: data.isActive,
  });

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'responders',
      entityId: id,
      description: `Actualizacion de la unidad ${updated.unit_code}`,
    },
    req
  );

  return updated;
}

/**
 * Cambia la disponibilidad.
 *
 * Reglas:
 *   - El personal solo puede cambiar SU propia disponibilidad.
 *   - No se puede marcar DISPONIBLE o FUERA_DE_SERVICIO una unidad que tiene
 *     una emergencia sin cerrar: primero hay que retirarla o cerrar el caso.
 */
async function changeStatus(id, status, actor, req) {
  const responder = await getById(id);

  if (!Object.values(RESPONDER_STATUS).includes(status)) {
    throw ApiError.validation([
      {
        field: 'status',
        message: `Estado no valido. Permitidos: ${Object.values(RESPONDER_STATUS).join(', ')}`,
      },
    ]);
  }

  if (actor.role_code === ROLES.PERSONAL && responder.user_id !== actor.id) {
    throw ApiError.forbidden('Solo puedes cambiar tu propia disponibilidad');
  }

  if (responder.status === status) {
    throw ApiError.badRequest(`La unidad ya esta en estado ${status}`);
  }

  if (status !== RESPONDER_STATUS.OCUPADO) {
    const busy = await assignmentModel.hasActiveWork(id);
    if (busy) {
      throw ApiError.badRequest(
        `La unidad ${responder.unit_code} tiene una emergencia sin cerrar. ` +
          'Cierra o retira la asignacion antes de cambiar su estado.'
      );
    }
  }

  await responderModel.updateStatus(id, status);

  await auditModel.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'responders',
      entityId: id,
      description: `${responder.unit_code}: estado ${responder.status} -> ${status}`,
    },
    req
  );

  const updated = await getById(id);
  realtime.responderStatusUpdated(updated);
  return updated;
}

/** El personal reporta su posicion GPS. */
async function updateOwnLocation(user, latitude, longitude) {
  const responder = await responderModel.findByUserId(user.id);
  if (!responder) {
    throw ApiError.forbidden('Tu usuario no tiene una ficha de personal asociada');
  }

  // La ubicacion se escribe muchas veces por minuto: no se audita ni se
  // registra en el historial para no llenar las tablas de ruido.
  const updated = await responderModel.updateLocation(responder.id, latitude, longitude);

  // Se emite solo al centro de control, que es quien pinta las unidades
  // moviendose en el mapa. Difundirlo a todos seria mucho trafico inutil.
  realtime.responderLocationUpdated(updated);

  return updated;
}

/** Tipos y estados disponibles, para poblar los formularios. */
function getCatalogs() {
  return {
    types: Object.values(RESPONDER_TYPES),
    statuses: Object.values(RESPONDER_STATUS),
  };
}

module.exports = {
  list,
  getById,
  getOwnProfile,
  findAvailable,
  create,
  update,
  changeStatus,
  updateOwnLocation,
  getCatalogs,
};
