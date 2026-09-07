/**
 * Reglas de negocio de las emergencias.
 *
 * Aqui vive lo que hace al sistema un sistema y no un CRUD:
 *   - Quien puede ver que emergencia (RN de la matriz de permisos).
 *   - Que transiciones de estado son legales (PENDIENTE -> EN_PROCESO -> ...).
 *   - Que se escribe en el historial en cada accion.
 *   - A quien se le notifica.
 *
 * Todo lo que toca varias tablas se hace dentro de una TRANSACCION: o se
 * guardan la emergencia, su ubicacion, sus fotos, su historial y sus
 * notificaciones, o no se guarda nada. Nunca queda una emergencia sin
 * ubicacion ni una notificacion de algo inexistente.
 */

'use strict';

const {
  ROLES,
  EMERGENCY_STATUS,
  STATUS_TRANSITIONS,
  PRIORITIES,
  HISTORY_ACTIONS,
  ASSIGNMENT_STATUS,
  AUDIT_ACTIONS,
} = require('../config/constants');

const { transaction } = require('../database');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination');

const emergencyModel = require('../models/emergency.model');
const locationModel = require('../models/location.model');
const photoModel = require('../models/photo.model');
const messageModel = require('../models/message.model');
const historyModel = require('../models/history.model');
const assignmentModel = require('../models/assignment.model');
const responderModel = require('../models/responder.model');
const catalogModel = require('../models/catalog.model');
const auditModel = require('../models/audit.model');
const notificationService = require('./notification.service');
const contactService = require('./contact.service');
const realtime = require('../sockets/realtime');
const { config } = require('../config/env');

/* =========================================================================
 *  Permisos
 * ====================================================================== */

/** Roles que ven todo el sistema. */
function isControlRoom(user) {
  return user.role_code === ROLES.OPERADOR || user.role_code === ROLES.ADMINISTRADOR;
}

/**
 * Comprueba que el usuario puede ver una emergencia concreta.
 *   - Operador y administrador: todas.
 *   - Ciudadano: solo las que reporto.
 *   - Personal: solo las que tiene asignadas.
 */
async function assertCanView(emergency, user) {
  if (isControlRoom(user)) return;

  if (user.role_code === ROLES.CIUDADANO) {
    if (emergency.reporter_id === user.id) return;
    throw ApiError.forbidden('Solo puedes consultar las emergencias que reportaste');
  }

  if (user.role_code === ROLES.PERSONAL) {
    const responder = await responderModel.findByUserId(user.id);
    if (responder) {
      const assignments = await assignmentModel.findByEmergency(emergency.id);
      const isAssigned = assignments.some(
        (assignment) =>
          assignment.responder_id === responder.id &&
          assignment.status !== ASSIGNMENT_STATUS.CANCELADO
      );
      if (isAssigned) return;
    }
    throw ApiError.forbidden('Solo puedes consultar las emergencias que tienes asignadas');
  }

  throw ApiError.forbidden('Tu rol no tiene permiso para consultar esta emergencia');
}

/** Busca la emergencia o lanza 404. */
async function getOrFail(id) {
  const emergency = await emergencyModel.findById(id);
  if (!emergency) throw ApiError.notFound('La emergencia no existe');
  return emergency;
}

/* =========================================================================
 *  Lecturas
 * ====================================================================== */

/** Traduce los parametros de la query a los filtros del modelo. */
function parseFilters(query = {}) {
  const filters = {
    status: query.status || null,
    type: query.type || null,
    priority: query.priority || null,
    zoneId: query.zone ? Number.parseInt(query.zone, 10) : null,
    search: query.search || null,
    from: query.from || null,
    to: query.to || null,
  };

  if (query.sos === 'true') filters.sos = true;
  if (query.sos === 'false') filters.sos = false;
  if (query.active === 'true') filters.activeOnly = true;

  return filters;
}

/** Listado general (centro de control). */
async function list(query, user) {
  if (!isControlRoom(user)) {
    throw ApiError.forbidden('Tu rol no tiene permiso para ver todas las emergencias');
  }

  const pagination = getPagination(query);
  const { items, total } = await emergencyModel.list(parseFilters(query), pagination, query);
  return { items, meta: buildMeta(pagination, total) };
}

/** Emergencias reportadas por el usuario autenticado. */
async function listMine(query, user) {
  const pagination = getPagination(query);
  const filters = { ...parseFilters(query), userId: user.id };
  const { items, total } = await emergencyModel.list(filters, pagination, query);
  return { items, meta: buildMeta(pagination, total) };
}

/** Emergencias asignadas al personal autenticado. */
async function listAssigned(query, user) {
  const responder = await responderModel.findByUserId(user.id);
  if (!responder) {
    throw ApiError.forbidden('Tu usuario no tiene una ficha de personal asociada');
  }

  const pagination = getPagination(query);
  const filters = { ...parseFilters(query), responderId: responder.id };
  const { items, total } = await emergencyModel.list(filters, pagination, query);

  return { items, meta: buildMeta(pagination, total), responder };
}

/** Puntos para el mapa del centro de control. */
async function listForMap(query, user) {
  if (!isControlRoom(user)) {
    throw ApiError.forbidden('Tu rol no tiene permiso para ver el mapa general');
  }

  const filters = parseFilters(query);
  // Por defecto el mapa muestra solo lo que sigue abierto.
  if (query.active === undefined) filters.activeOnly = true;

  const [emergencies, responders] = await Promise.all([
    emergencyModel.listForMap(filters),
    responderModel.listForMap(),
  ]);

  return {
    emergencies,
    responders,
    center: { lat: config.geo.lat, lng: config.geo.lng },
    zoom: config.geo.zoom,
  };
}

/** Detalle completo: emergencia + fotos + historial + asignaciones. */
async function getById(id, user) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);

  const [photos, history, assignments] = await Promise.all([
    photoModel.findByEmergency(id),
    historyModel.findByEmergency(id),
    assignmentModel.findByEmergency(id),
  ]);

  return { ...emergency, photos, history, assignments };
}

/** Linea de tiempo. */
async function getHistory(id, user) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);
  return historyModel.findByEmergency(id);
}

/* =========================================================================
 *  Chat de la emergencia (centro de control <-> personal asignado)
 * ====================================================================== */

/** Ids de usuario del personal con asignacion activa, para avisarles por su canal. */
async function getAssignedUserIds(emergencyId) {
  const assignments = await assignmentModel.findByEmergency(emergencyId);
  return assignments
    .filter((assignment) => assignment.status !== ASSIGNMENT_STATUS.CANCELADO)
    .map((assignment) => assignment.responder_user_id)
    .filter(Boolean);
}

/**
 * Historial del chat.
 * La ruta ya excluye al ciudadano (solo PERSONAL/OPERADOR/ADMINISTRADOR la
 * usan); assertCanView aqui solo hace falta para el caso de PERSONAL, que
 * debe tener la emergencia asignada.
 */
async function listMessages(id, user) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);
  return messageModel.findByEmergency(id);
}

/** Envia un mensaje del chat y lo emite en tiempo real. */
async function addMessage(id, user, text) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);

  const message = await messageModel.create({ emergencyId: id, senderId: user.id, message: text });

  const enriched = {
    ...message,
    sender_name: `${user.first_name} ${user.last_name}`,
    sender_role_code: user.role_code,
  };

  const assignedUserIds = await getAssignedUserIds(id);
  realtime.emergencyMessageSent(enriched, assignedUserIds);

  return enriched;
}

/* =========================================================================
 *  Creacion
 * ====================================================================== */

/**
 * Resuelve los codigos de catalogo a ids, validando que existan.
 * Devuelve un 422 con el campo exacto si alguno es invalido.
 */
async function resolveCatalogs({ typeCode, priorityCode, statusCode }) {
  const [type, priority, status] = await Promise.all([
    catalogModel.findTypeByCode(typeCode),
    catalogModel.findPriorityByCode(priorityCode),
    catalogModel.findStatusByCode(statusCode),
  ]);

  const errors = [];
  if (!type) errors.push({ field: 'type', message: `Tipo de emergencia no valido: ${typeCode}` });
  if (!priority) errors.push({ field: 'priority', message: `Prioridad no valida: ${priorityCode}` });
  if (!status) errors.push({ field: 'status', message: `Estado no valido: ${statusCode}` });

  if (errors.length > 0) throw ApiError.validation(errors);

  return { type, priority, status };
}

/**
 * Crea una emergencia con su ubicacion, sus fotos, su historial y sus avisos.
 *
 * @param {object} data          Datos ya validados.
 * @param {Array}  photoRecords  Fotos preparadas por upload.middleware.
 * @param {object} user          Usuario autenticado.
 * @param {object} req           Para la auditoria.
 * @param {boolean} isSos        true si viene del boton SOS.
 */
async function create(data, photoRecords, user, req, isSos = false) {
  // Un SOS entra siempre como CRITICA, sin importar lo que envie el cliente.
  const priorityCode = isSos ? PRIORITIES.CRITICA : data.priority || PRIORITIES.MEDIA;

  const { type, priority, status } = await resolveCatalogs({
    typeCode: data.type,
    priorityCode,
    statusCode: EMERGENCY_STATUS.PENDIENTE,
  });

  // Si el ciudadano no indica zona, se deduce por cercania para que las
  // estadisticas por zona no queden vacias.
  let zoneId = data.zoneId || null;
  if (!zoneId) {
    const nearest = await catalogModel.findNearestZone(data.latitude, data.longitude);
    zoneId = nearest ? nearest.id : null;
  }

  const result = await transaction(async (client) => {
    const location = await locationModel.create(
      {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        reference: data.reference,
        zone_id: zoneId,
        accuracy_m: data.accuracy,
      },
      client
    );

    const emergency = await emergencyModel.create(
      {
        user_id: user.id,
        type_id: type.id,
        status_id: status.id,
        priority_id: priority.id,
        location_id: location.id,
        title: data.title,
        description: data.description,
        is_sos: isSos,
      },
      client
    );

    if (photoRecords.length > 0) {
      await photoModel.createMany(emergency.id, photoRecords, client);
    }

    await historyModel.add(
      {
        emergencyId: emergency.id,
        userId: user.id,
        statusId: status.id,
        action: HISTORY_ACTIONS.CREADA,
        description: isSos
          ? 'Emergencia SOS activada por el ciudadano'
          : 'Emergencia reportada por el ciudadano',
        metadata: {
          type: type.code,
          priority: priority.code,
          photos: photoRecords.length,
          isSos,
        },
      },
      client
    );

    const forNotifications = { ...emergency, is_sos: isSos, title: data.title, user_id: user.id };
    const forControlRoom = await notificationService.notifyNewEmergency(forNotifications, client);
    const forReporter = await notificationService.notifyReportReceived(forNotifications, client);

    // Las notificaciones se devuelven para emitirlas DESPUES del commit.
    return { emergency, notifications: [...forControlRoom, forReporter] };
  });

  const { emergency: created, notifications } = result;

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.CREAR,
      entity: 'emergencies',
      entityId: created.id,
      description: isSos
        ? `Activacion del boton SOS (${created.code})`
        : `Reporte de emergencia ${created.code}`,
      metadata: { type: type.code, priority: priority.code },
    },
    req
  );

  const full = await getById(created.id, user);

  // Tiempo real: la transaccion ya confirmo, asi que lo que se anuncia existe.
  realtime.emergencyCreated(full);
  notificationService.deliver(notifications);

  // Un SOS tambien avisa por correo a los contactos de confianza del
  // ciudadano, no solo al centro de control. No se espera a que termine
  // (best effort): un correo lento no debe demorar la respuesta del SOS.
  if (isSos) contactService.notifyOnSos(user, full);

  return full;
}

/** Boton SOS: emergencia critica con los datos minimos. */
async function createSos(data, user, req) {
  return create(
    {
      type: data.type || 'MEDICA',
      title: data.title || 'SOS - Emergencia activada desde el boton de panico',
      description:
        data.description ||
        'Activacion del boton SOS. El ciudadano puede no estar en condiciones de dar mas detalles.',
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      reference: data.reference,
      accuracy: data.accuracy,
      zoneId: data.zoneId,
    },
    [],
    user,
    req,
    true
  );
}

/* =========================================================================
 *  Modificaciones
 * ====================================================================== */

/** Actualiza titulo, descripcion y, si llega, la ubicacion. */
async function update(id, data, user, req) {
  const emergency = await getOrFail(id);

  await transaction(async (client) => {
    await emergencyModel.update(id, { title: data.title, description: data.description }, client);

    // Cambiar la ubicacion crea un punto nuevo: el anterior se conserva por si
    // alguna consulta historica lo referencia.
    if (data.latitude !== undefined && data.longitude !== undefined) {
      let zoneId = data.zoneId || null;
      if (!zoneId) {
        const nearest = await catalogModel.findNearestZone(data.latitude, data.longitude);
        zoneId = nearest ? nearest.id : null;
      }

      const location = await locationModel.create(
        {
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address,
          reference: data.reference,
          zone_id: zoneId,
          accuracy_m: data.accuracy,
        },
        client
      );

      await emergencyModel.updateLocation(id, location.id, client);
    }

    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: emergency.status_id,
        action: HISTORY_ACTIONS.COMENTARIO,
        description: 'El operador actualizo la informacion de la emergencia',
        metadata: { title: data.title, hasNewLocation: data.latitude !== undefined },
      },
      client
    );
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'emergencies',
      entityId: id,
      description: `Actualizacion de la emergencia ${emergency.code}`,
    },
    req
  );

  const full = await getById(id, user);
  realtime.emergencyUpdated(full);
  return full;
}

/**
 * Cambia el estado respetando el flujo permitido.
 *
 * PENDIENTE  -> EN_PROCESO | CANCELADO
 * EN_PROCESO -> RESUELTO   | CANCELADO
 * RESUELTO / CANCELADO son finales.
 */
async function changeStatus(id, newStatusCode, data, user, req) {
  const emergency = await getOrFail(id);

  // El personal solo puede tocar las emergencias que tiene asignadas.
  if (user.role_code === ROLES.PERSONAL) {
    await assertCanView(emergency, user);
  }

  const currentCode = emergency.status_code;

  if (currentCode === newStatusCode) {
    throw ApiError.badRequest(`La emergencia ya esta en estado ${newStatusCode}`);
  }

  const allowed = STATUS_TRANSITIONS[currentCode] || [];
  if (!allowed.includes(newStatusCode)) {
    throw ApiError.badRequest(
      allowed.length === 0
        ? `La emergencia esta ${currentCode} y ya no admite cambios de estado`
        : `No se puede pasar de ${currentCode} a ${newStatusCode}. ` +
            `Desde ${currentCode} solo se permite: ${allowed.join(', ')}`
    );
  }

  if (newStatusCode === EMERGENCY_STATUS.CANCELADO && !data.reason) {
    throw ApiError.validation([
      { field: 'reason', message: 'Debes indicar el motivo de la cancelacion' },
    ]);
  }

  const newStatus = await catalogModel.findStatusByCode(newStatusCode);

  const notification = await transaction(async (client) => {
    await emergencyModel.updateStatus(
      id,
      newStatusCode,
      newStatus.id,
      {
        resolutionNotes: newStatusCode === EMERGENCY_STATUS.RESUELTO ? data.notes : null,
        cancelReason: newStatusCode === EMERGENCY_STATUS.CANCELADO ? data.reason : null,
      },
      client
    );

    // Al cerrar la emergencia se cierran sus asignaciones y se liberan las
    // unidades: si no, quedarian OCUPADAS para siempre.
    if (newStatusCode === EMERGENCY_STATUS.RESUELTO || newStatusCode === EMERGENCY_STATUS.CANCELADO) {
      const freedResponders = await assignmentModel.completeAllForEmergency(id, client);
      for (const responderId of freedResponders) {
        const stillBusy = await assignmentModel.hasActiveWork(responderId, client);
        if (!stillBusy) await responderModel.markAvailable(responderId, client);
      }
    }

    const descriptions = {
      EN_PROCESO: 'La emergencia paso a EN PROCESO: personal atendiendo en el sitio',
      RESUELTO: data.notes || 'Emergencia resuelta',
      CANCELADO: data.reason || 'Emergencia cancelada',
    };

    const actions = {
      EN_PROCESO: HISTORY_ACTIONS.ESTADO_CAMBIADO,
      RESUELTO: HISTORY_ACTIONS.RESUELTA,
      CANCELADO: HISTORY_ACTIONS.CANCELADA,
    };

    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: newStatus.id,
        action: actions[newStatusCode] || HISTORY_ACTIONS.ESTADO_CAMBIADO,
        description: descriptions[newStatusCode] || `Estado cambiado a ${newStatusCode}`,
        metadata: { from: currentCode, to: newStatusCode },
      },
      client
    );

    return notificationService.notifyStatusChange(emergency, newStatusCode, client);
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.CAMBIO_ESTADO,
      entity: 'emergencies',
      entityId: id,
      description: `${emergency.code}: ${currentCode} -> ${newStatusCode}`,
      metadata: { from: currentCode, to: newStatusCode },
    },
    req
  );

  const full = await getById(id, user);
  realtime.emergencyStatusChanged(full, currentCode);
  notificationService.deliver(notification);
  return full;
}

/** Cambia la prioridad. */
async function changePriority(id, priorityCode, user, req) {
  const emergency = await getOrFail(id);

  const priority = await catalogModel.findPriorityByCode(priorityCode);
  if (!priority) {
    throw ApiError.validation([
      { field: 'priority', message: `Prioridad no valida: ${priorityCode}` },
    ]);
  }

  if (emergency.priority_code === priorityCode) {
    throw ApiError.badRequest(`La emergencia ya tiene prioridad ${priorityCode}`);
  }

  await transaction(async (client) => {
    await emergencyModel.updatePriority(id, priority.id, client);
    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: emergency.status_id,
        action: HISTORY_ACTIONS.PRIORIDAD_CAMBIADA,
        description: `Prioridad cambiada de ${emergency.priority_name} a ${priority.name}`,
        metadata: { from: emergency.priority_code, to: priority.code },
      },
      client
    );
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'emergencies',
      entityId: id,
      description: `${emergency.code}: prioridad ${emergency.priority_code} -> ${priority.code}`,
    },
    req
  );

  const full = await getById(id, user);
  realtime.emergencyPriorityChanged(full, emergency.priority_code);
  return full;
}

/* =========================================================================
 *  Asignaciones
 * ====================================================================== */

/**
 * Asigna una o varias unidades a la emergencia.
 * Si la unidad ya estuvo asignada y se retiro, se reactiva su asignacion en
 * lugar de crear una nueva (la restriccion UNIQUE lo impide).
 */
async function assign(id, responderIds = [], notes, user, req) {
  const emergency = await getOrFail(id);

  if (emergency.status_is_final) {
    throw ApiError.badRequest(
      `La emergencia esta ${emergency.status_code} y ya no admite asignaciones`
    );
  }

  if (responderIds.length === 0) {
    throw ApiError.validation([
      { field: 'responderIds', message: 'Debes seleccionar al menos una unidad' },
    ]);
  }

  // Se validan TODAS las unidades antes de tocar la base de datos, para no
  // dejar media asignacion hecha si una de ellas no existe.
  const responders = [];
  for (const responderId of responderIds) {
    const responder = await responderModel.findById(responderId);
    if (!responder) {
      throw ApiError.validation([
        { field: 'responderIds', message: `La unidad ${responderId} no existe` },
      ]);
    }
    if (!responder.is_active) {
      throw ApiError.validation([
        { field: 'responderIds', message: `La unidad ${responder.unit_code} esta inactiva` },
      ]);
    }
    responders.push(responder);
  }

  const assignment = await transaction(async (client) => {
    const result = [];

    for (const responder of responders) {
      const previous = await assignmentModel.findAny(id, responder.id, client);

      // Ya esta asignada y activa: no se duplica ni se reinician sus tiempos.
      if (previous && previous.status !== ASSIGNMENT_STATUS.CANCELADO) continue;

      if (previous) {
        // Estuvo asignada y se retiro: se reactiva la misma fila.
        await assignmentModel.reactivate(previous.id, user.id, notes, client);
      } else {
        await assignmentModel.create(
          { emergencyId: id, responderId: responder.id, assignedBy: user.id, notes },
          client
        );
      }

      await responderModel.markBusy(responder.id, client);
      result.push(responder);
    }

    if (result.length === 0) {
      throw ApiError.conflict('Todas las unidades seleccionadas ya estaban asignadas');
    }

    await emergencyModel.markAssigned(id, client);

    const unitList = result.map((responder) => responder.unit_code).join(', ');
    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: emergency.status_id,
        action: HISTORY_ACTIONS.ASIGNADA,
        description: `Personal asignado: ${unitList}`,
        metadata: { units: result.map((responder) => responder.unit_code) },
      },
      client
    );

    const notifications = await notificationService.notifyAssignment(
      emergency,
      emergency.reporter_id,
      result.map((responder) => ({ userId: responder.user_id, unitCode: responder.unit_code })),
      client
    );

    return { responders: result, notifications };
  });

  const { responders: assigned, notifications } = assignment;

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ASIGNAR,
      entity: 'emergencies',
      entityId: id,
      description: `${emergency.code}: asignadas ${assigned.map((r) => r.unit_code).join(', ')}`,
    },
    req
  );

  const full = await getById(id, user);
  realtime.emergencyAssigned(full, assigned);
  notificationService.deliver(notifications);

  // Las unidades pasaron a OCUPADO: el mapa del centro de control debe reflejarlo.
  assigned.forEach((responder) =>
    realtime.responderStatusUpdated({ ...responder, status: 'OCUPADO' })
  );

  return full;
}

/** Retira una unidad de la emergencia. */
async function unassign(id, assignmentId, user, req) {
  const emergency = await getOrFail(id);

  const assignment = await assignmentModel.findById(assignmentId);
  if (!assignment || assignment.emergency_id !== emergency.id) {
    throw ApiError.notFound('La asignacion no existe en esta emergencia');
  }

  await transaction(async (client) => {
    const cancelled = await assignmentModel.cancel(assignmentId, client);
    if (!cancelled) throw ApiError.badRequest('Esa asignacion ya estaba cancelada');

    // La unidad vuelve a estar disponible solo si no le queda otro incidente.
    const stillBusy = await assignmentModel.hasActiveWork(assignment.responder_id, client);
    if (!stillBusy) await responderModel.markAvailable(assignment.responder_id, client);

    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: emergency.status_id,
        action: HISTORY_ACTIONS.ASIGNACION_RETIRADA,
        description: `Se retiro la unidad ${assignment.unit_code}`,
        metadata: { unitCode: assignment.unit_code },
      },
      client
    );
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'assignments',
      entityId: assignmentId,
      description: `${emergency.code}: retirada la unidad ${assignment.unit_code}`,
    },
    req
  );

  const full = await getById(id, user);
  realtime.emergencyUnassigned(full, assignment);
  return full;
}

/* =========================================================================
 *  Avances y fotografias
 * ====================================================================== */

/** Registra un avance en la linea de tiempo. */
async function addComment(id, text, user, req) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);

  const entry = await historyModel.add({
    emergencyId: id,
    userId: user.id,
    statusId: emergency.status_id,
    action: HISTORY_ACTIONS.COMENTARIO,
    description: text,
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'emergencies',
      entityId: id,
      description: `${emergency.code}: avance registrado`,
    },
    req
  );

  return entry;
}

/** Añade fotografias a una emergencia ya creada. */
async function addPhotos(id, photoRecords, user, req) {
  const emergency = await getOrFail(id);
  await assertCanView(emergency, user);

  if (photoRecords.length === 0) {
    throw ApiError.badRequest('No se recibio ninguna fotografia');
  }

  const already = await photoModel.countByEmergency(id);
  const maximum = config.storage.maxFilesPerEmergency;

  if (already + photoRecords.length > maximum) {
    throw ApiError.badRequest(
      `Esta emergencia ya tiene ${already} fotografias. El maximo es ${maximum}.`
    );
  }

  const saved = await transaction(async (client) => {
    const rows = await photoModel.createMany(id, photoRecords, client);

    await historyModel.add(
      {
        emergencyId: id,
        userId: user.id,
        statusId: emergency.status_id,
        action: HISTORY_ACTIONS.FOTO_AGREGADA,
        description: `Se agregaron ${rows.length} fotografia(s)`,
        metadata: { count: rows.length },
      },
      client
    );

    return rows;
  });

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ACTUALIZAR,
      entity: 'photos',
      entityId: id,
      description: `${emergency.code}: ${saved.length} fotografia(s) agregadas`,
    },
    req
  );

  return photoModel.findByEmergency(id);
}

/* =========================================================================
 *  Baja logica
 * ====================================================================== */

/** Elimina (baja logica) una emergencia. Solo administrador. */
async function remove(id, user, req) {
  const emergency = await getOrFail(id);

  const deleted = await emergencyModel.softDelete(id);
  if (!deleted) throw ApiError.badRequest('La emergencia ya estaba eliminada');

  await auditModel.record(
    {
      userId: user.id,
      action: AUDIT_ACTIONS.ELIMINAR,
      entity: 'emergencies',
      entityId: id,
      description: `Eliminacion logica de la emergencia ${emergency.code}`,
    },
    req
  );

  return { id, code: emergency.code, deleted: true };
}

module.exports = {
  list,
  listMine,
  listAssigned,
  listForMap,
  getById,
  getHistory,
  listMessages,
  addMessage,
  create,
  createSos,
  update,
  changeStatus,
  changePriority,
  assign,
  unassign,
  addComment,
  addPhotos,
  remove,
};
