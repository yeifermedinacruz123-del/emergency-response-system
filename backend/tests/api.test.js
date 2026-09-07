/**
 * Prueba de humo de la API del Emergency Response System.
 * Ejercita autenticacion, roles, emergencias, SOS, asignaciones, transiciones
 * de estado, estadisticas y notificaciones contra el servidor real.
 */

'use strict';

const BASE = 'http://localhost:4000/api';
const PASSWORD = 'Emergencia2026*';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    console.log(`  FALLA ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { status: response.status, body: payload };
}

const login = async (email) => {
  const result = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return result.body?.data?.accessToken;
};

async function main() {
  console.log('\n===== 1. AUTENTICACION =====');

  const bad = await call('POST', '/auth/login', {
    body: { email: 'admin@ers.gov.co', password: 'claveIncorrecta1' },
  });
  check('Login con clave incorrecta -> 401', bad.status === 401, `status ${bad.status}`);
  check(
    'El mensaje de error no revela si el correo existe',
    !/no existe|not found/i.test(bad.body?.message || ''),
    bad.body?.message
  );

  const inexistent = await call('POST', '/auth/login', {
    body: { email: 'nadie@ejemplo.com', password: 'ClaveValida1' },
  });
  check(
    'Correo inexistente da el MISMO mensaje que clave mala',
    inexistent.body?.message === bad.body?.message,
    `"${inexistent.body?.message}" vs "${bad.body?.message}"`
  );

  const adminToken = await login('admin@ers.gov.co');
  const operatorToken = await login('operador1@ers.gov.co');
  const citizenToken = await login('maria.ruiz@example.com');
  const staffToken = await login('camilo.ospina@ers.gov.co');

  check('Login administrador', Boolean(adminToken));
  check('Login operador', Boolean(operatorToken));
  check('Login ciudadano', Boolean(citizenToken));
  check('Login personal', Boolean(staffToken));

  const profile = await call('GET', '/auth/profile', { token: adminToken });
  check('GET /auth/profile devuelve el rol', profile.body?.data?.role_code === 'ADMINISTRADOR');
  check('El perfil NO expone password_hash', profile.body?.data?.password_hash === undefined);

  const noToken = await call('GET', '/auth/profile');
  check('Sin token -> 401', noToken.status === 401, `status ${noToken.status}`);

  const badToken = await call('GET', '/auth/profile', { token: 'token.falso.aqui' });
  check('Token invalido -> 401', badToken.status === 401, `status ${badToken.status}`);

  console.log('\n===== 2. PERMISOS POR ROL =====');

  const citizenAll = await call('GET', '/emergencies', { token: citizenToken });
  check('Ciudadano NO puede listar todas -> 403', citizenAll.status === 403, `status ${citizenAll.status}`);

  const operatorAll = await call('GET', '/emergencies?limit=5', { token: operatorToken });
  check('Operador SI puede listar todas -> 200', operatorAll.status === 200);
  check('El listado trae metadatos de paginacion', Boolean(operatorAll.body?.meta?.total));

  const citizenUsers = await call('GET', '/users', { token: citizenToken });
  check('Ciudadano NO accede a /users -> 403', citizenUsers.status === 403);

  const operatorUsers = await call('GET', '/users', { token: operatorToken });
  check('Operador NO accede a /users -> 403', operatorUsers.status === 403);

  const adminUsers = await call('GET', '/users?limit=5', { token: adminToken });
  check('Admin SI accede a /users -> 200', adminUsers.status === 200);

  const citizenStats = await call('GET', '/statistics/dashboard', { token: citizenToken });
  check('Ciudadano NO ve estadisticas -> 403', citizenStats.status === 403);

  console.log('\n===== 3. VALIDACION DE ENTRADA =====');

  const invalid = await call('POST', '/emergencies', {
    token: citizenToken,
    body: { title: 'ab', type: 'NO_EXISTE', latitude: 999 },
  });
  check('Datos invalidos -> 422', invalid.status === 422, `status ${invalid.status}`);
  check('El 422 detalla los campos', Array.isArray(invalid.body?.errors) && invalid.body.errors.length >= 3,
    JSON.stringify(invalid.body?.errors?.map((e) => e.field)));

  console.log('\n===== 4. CREAR EMERGENCIA =====');

  const created = await call('POST', '/emergencies', {
    token: citizenToken,
    body: {
      title: 'Prueba automatizada de incendio',
      description: 'Emergencia creada por la prueba de humo.',
      type: 'INCENDIO',
      priority: 'ALTA',
      latitude: 4.1445,
      longitude: -73.6285,
      address: 'Calle de prueba 123',
      reference: 'Junto al parque',
    },
  });

  check('POST /emergencies -> 201', created.status === 201, `status ${created.status} ${created.body?.message}`);
  const emergency = created.body?.data;
  check('Se genero el codigo ERS-', /^ERS-\d{4}-\d{6}$/.test(emergency?.code || ''), emergency?.code);
  check('Entra en estado PENDIENTE', emergency?.status_code === 'PENDIENTE');
  check('Se asigno zona automaticamente', Boolean(emergency?.zone_id), `zone_id=${emergency?.zone_id}`);
  check('El historial registra la creacion', emergency?.history?.some((h) => h.action === 'CREADA'));

  console.log('\n===== 5. BOTON SOS =====');

  const sos = await call('POST', '/emergencies/sos', {
    token: citizenToken,
    body: { latitude: 4.1401, longitude: -73.6299 },
  });

  check('POST /emergencies/sos -> 201', sos.status === 201, `status ${sos.status} ${sos.body?.message}`);
  const sosEmergency = sos.body?.data;
  check('El SOS es CRITICA automaticamente', sosEmergency?.priority_code === 'CRITICA', sosEmergency?.priority_code);
  check('Marcado como is_sos', sosEmergency?.is_sos === true);
  check('El SOS funciona sin titulo ni descripcion', Boolean(sosEmergency?.title));

  console.log('\n===== 6. AISLAMIENTO ENTRE CIUDADANOS =====');

  const otherCitizenToken = await login('jorge.castro@example.com');
  const peek = await call('GET', `/emergencies/${emergency.id}`, { token: otherCitizenToken });
  check('Otro ciudadano NO ve la emergencia ajena -> 403', peek.status === 403, `status ${peek.status}`);

  const own = await call('GET', `/emergencies/${emergency.id}`, { token: citizenToken });
  check('El dueño SI ve su emergencia -> 200', own.status === 200);

  const mine = await call('GET', '/emergencies/mine', { token: citizenToken });
  check('GET /emergencies/mine devuelve solo las suyas',
    mine.body?.data?.every((e) => e.reporter_id === own.body.data.reporter_id));

  console.log('\n===== 7. ASIGNACION DE PERSONAL =====');

  const available = await call('GET', '/responders/available?type=BOMBERO&lat=4.1445&lng=-73.6285', {
    token: operatorToken,
  });
  check('GET /responders/available -> 200', available.status === 200);
  const unit = available.body?.data?.[0];
  check('Hay al menos un bombero disponible', Boolean(unit), JSON.stringify(available.body?.data?.length));
  check('Se calculo la distancia', unit && unit.distance_km !== null, `distance_km=${unit?.distance_km}`);

  const assigned = await call('POST', `/emergencies/${emergency.id}/assign`, {
    token: operatorToken,
    body: { responderIds: [unit.id], notes: 'Asignacion de prueba' },
  });
  check('POST /assign -> 200', assigned.status === 200, `status ${assigned.status} ${assigned.body?.message}`);
  check('Se registro assigned_at', Boolean(assigned.body?.data?.assigned_at));
  check('El historial registra la asignacion',
    assigned.body?.data?.history?.some((h) => h.action === 'ASIGNADA'));

  const unitAfter = await call('GET', `/responders/${unit.id}`, { token: operatorToken });
  check('La unidad quedo OCUPADA', unitAfter.body?.data?.status === 'OCUPADO', unitAfter.body?.data?.status);

  const duplicate = await call('POST', `/emergencies/${emergency.id}/assign`, {
    token: operatorToken,
    body: { responderIds: [unit.id] },
  });
  check('Asignar dos veces la misma unidad -> 409', duplicate.status === 409, `status ${duplicate.status}`);

  console.log('\n===== 8. TRANSICIONES DE ESTADO =====');

  const illegal = await call('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'RESUELTO' },
  });
  check('PENDIENTE -> RESUELTO se rechaza -> 400', illegal.status === 400, `status ${illegal.status}`);
  check('El error explica que transiciones si valen',
    /EN_PROCESO/.test(illegal.body?.message || ''), illegal.body?.message);

  const toProgress = await call('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'EN_PROCESO' },
  });
  check('PENDIENTE -> EN_PROCESO -> 200', toProgress.status === 200, `status ${toProgress.status}`);
  check('Se sello in_progress_at', Boolean(toProgress.body?.data?.in_progress_at));

  const cancelNoReason = await call('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'CANCELADO' },
  });
  check('Cancelar sin motivo -> 422', cancelNoReason.status === 422, `status ${cancelNoReason.status}`);

  const resolved = await call('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'RESUELTO', notes: 'Incendio controlado en la prueba.' },
  });
  check('EN_PROCESO -> RESUELTO -> 200', resolved.status === 200, `status ${resolved.status}`);
  check('Se sello resolved_at', Boolean(resolved.body?.data?.resolved_at));

  const unitFreed = await call('GET', `/responders/${unit.id}`, { token: operatorToken });
  check('Al resolver, la unidad vuelve a DISPONIBLE',
    unitFreed.body?.data?.status === 'DISPONIBLE', unitFreed.body?.data?.status);

  const afterFinal = await call('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'EN_PROCESO' },
  });
  check('RESUELTO ya no admite cambios -> 400', afterFinal.status === 400, `status ${afterFinal.status}`);

  console.log('\n===== 9. PRIORIDAD, COMENTARIOS E HISTORIAL =====');

  const priority = await call('PATCH', `/emergencies/${sosEmergency.id}/priority`, {
    token: operatorToken,
    body: { priority: 'ALTA' },
  });
  check('PATCH /priority -> 200', priority.status === 200, `status ${priority.status}`);
  check('La prioridad cambio', priority.body?.data?.priority_code === 'ALTA');

  const comment = await call('POST', `/emergencies/${sosEmergency.id}/comments`, {
    token: operatorToken,
    body: { text: 'Avance registrado por la prueba de humo.' },
  });
  check('POST /comments -> 201', comment.status === 201, `status ${comment.status}`);

  const history = await call('GET', `/emergencies/${sosEmergency.id}/history`, { token: operatorToken });
  check('GET /history -> 200', history.status === 200);
  check('El historial esta en orden cronologico',
    history.body?.data?.every((h, i, arr) =>
      i === 0 || new Date(arr[i - 1].created_at) <= new Date(h.created_at)));

  console.log('\n===== 10. PERSONAL: SOLO LO SUYO =====');

  const staffAssigned = await call('GET', '/emergencies/assigned', { token: staffToken });
  check('GET /emergencies/assigned -> 200', staffAssigned.status === 200, `status ${staffAssigned.status}`);

  const staffAll = await call('GET', '/emergencies', { token: staffToken });
  check('Personal NO lista todas -> 403', staffAll.status === 403);

  const locationUpdate = await call('PATCH', '/responders/me/location', {
    token: staffToken,
    body: { latitude: 4.1500, longitude: -73.6300 },
  });
  check('PATCH /responders/me/location -> 200', locationUpdate.status === 200, `status ${locationUpdate.status}`);
  check('La posicion se guardo',
    Number(locationUpdate.body?.data?.current_latitude) === 4.15,
    String(locationUpdate.body?.data?.current_latitude));

  console.log('\n===== 11. ESTADISTICAS =====');

  const dashboard = await call('GET', '/statistics/dashboard', { token: operatorToken });
  check('GET /statistics/dashboard -> 200', dashboard.status === 200);
  const counters = dashboard.body?.data?.counters;
  check('Trae contadores reales', counters && counters.total > 0, JSON.stringify(counters?.total));
  check('Trae serie por dia', Array.isArray(dashboard.body?.data?.charts?.byDay));
  check('Trae tiempo de respuesta',
    dashboard.body?.data?.responseTime?.avg_response_minutes !== undefined);

  const byZone = await call('GET', '/statistics/emergencies/by-zone', { token: operatorToken });
  check('GET /by-zone -> 200', byZone.status === 200);
  check('by-zone devuelve etiquetas', byZone.body?.data?.[0]?.label !== undefined);

  const responseTime = await call('GET', '/statistics/response-time', { token: operatorToken });
  check('GET /response-time -> 200', responseTime.status === 200);
  check('Incluye carga por unidad', Array.isArray(responseTime.body?.data?.workload));

  console.log('\n===== 12. MAPA Y CATALOGOS =====');

  const map = await call('GET', '/emergencies/map', { token: operatorToken });
  check('GET /emergencies/map -> 200', map.status === 200);
  check('El mapa trae emergencias', Array.isArray(map.body?.data?.emergencies));
  check('El mapa trae unidades', Array.isArray(map.body?.data?.responders));

  const catalogs = await call('GET', '/catalogs', { token: citizenToken });
  check('GET /catalogs -> 200', catalogs.status === 200);
  check('Catalogo de tipos completo', catalogs.body?.data?.types?.length === 7,
    `tipos=${catalogs.body?.data?.types?.length}`);
  check('Catalogo de zonas completo', catalogs.body?.data?.zones?.length === 10,
    `zonas=${catalogs.body?.data?.zones?.length}`);

  console.log('\n===== 13. NOTIFICACIONES =====');

  const notifications = await call('GET', '/notifications', { token: citizenToken });
  check('GET /notifications -> 200', notifications.status === 200);
  check('El ciudadano tiene notificaciones', notifications.body?.data?.length > 0);

  const unread = await call('GET', '/notifications/unread-count', { token: operatorToken });
  check('GET /unread-count -> 200', unread.status === 200);
  check('El operador tiene avisos sin leer', unread.body?.data?.unread > 0, `unread=${unread.body?.data?.unread}`);

  const first = notifications.body?.data?.find((n) => !n.is_read);
  if (first) {
    const read = await call('PATCH', `/notifications/${first.id}/read`, { token: citizenToken });
    check('PATCH /:id/read -> 200', read.status === 200);

    const foreign = await call('PATCH', `/notifications/${first.id}/read`, { token: otherCitizenToken });
    check('No se puede marcar la notificacion de otro -> 404', foreign.status === 404, `status ${foreign.status}`);
  }

  console.log('\n===== 14. GESTION DE USUARIOS =====');

  const newUser = await call('POST', '/users', {
    token: adminToken,
    body: {
      firstName: 'Usuario', lastName: 'DePrueba',
      email: `prueba.${Date.now()}@ers.gov.co`,
      documentNumber: `TEST${Date.now()}`.slice(0, 20),
      password: 'ClaveSegura1', role: 'OPERADOR',
    },
  });
  check('POST /users -> 201', newUser.status === 201, `status ${newUser.status} ${newUser.body?.message}`);
  const userId = newUser.body?.data?.id;

  const duplicateEmail = await call('POST', '/users', {
    token: adminToken,
    body: {
      firstName: 'Otro', lastName: 'Usuario',
      email: 'admin@ers.gov.co', documentNumber: '9999999999',
      password: 'ClaveSegura1', role: 'CIUDADANO',
    },
  });
  check('Correo duplicado -> 409', duplicateEmail.status === 409, `status ${duplicateEmail.status}`);

  const deactivate = await call('PATCH', `/users/${userId}/status`, {
    token: adminToken, body: { isActive: false },
  });
  check('PATCH /users/:id/status -> 200', deactivate.status === 200);
  check('El usuario quedo inactivo', deactivate.body?.data?.is_active === false);

  const selfDeactivate = await call('PATCH', '/users/1/status', {
    token: adminToken, body: { isActive: false },
  });
  check('El admin NO puede desactivarse a si mismo -> 400', selfDeactivate.status === 400,
    `status ${selfDeactivate.status}`);

  const deleteWithHistory = await call('DELETE', '/users/4', { token: adminToken });
  check('No se borra un usuario con emergencias -> 409', deleteWithHistory.status === 409,
    `status ${deleteWithHistory.status}`);

  await call('DELETE', `/users/${userId}`, { token: adminToken });

  console.log('\n===== 15. AUDITORIA Y CONFIGURACION =====');

  const audit = await call('GET', '/audit?limit=5', { token: adminToken });
  check('GET /audit -> 200', audit.status === 200);
  check('La auditoria registro los accesos', audit.body?.data?.length > 0);

  const settings = await call('GET', '/settings', { token: adminToken });
  check('GET /settings -> 200', settings.status === 200);
  check('Los valores vienen con su tipo real',
    typeof settings.body?.data?.find((s) => s.key === 'map.zoom')?.value === 'number');

  console.log('\n===== 16. SESIONES =====');

  const loginForRefresh = await call('POST', '/auth/login', {
    body: { email: 'operador2@ers.gov.co', password: PASSWORD },
  });
  const refreshToken = loginForRefresh.body?.data?.refreshToken;

  const refreshed = await call('POST', '/auth/refresh', { body: { refreshToken } });
  check('POST /auth/refresh -> 200', refreshed.status === 200, `status ${refreshed.status}`);
  check('Devuelve un accessToken nuevo', Boolean(refreshed.body?.data?.accessToken));

  const reused = await call('POST', '/auth/refresh', { body: { refreshToken } });
  check('El token de refresco NO se puede reusar (rotacion) -> 401', reused.status === 401,
    `status ${reused.status}`);

  const notFound = await call('GET', '/emergencies/999999', { token: operatorToken });
  check('Emergencia inexistente -> 404', notFound.status === 404, `status ${notFound.status}`);

  console.log('\n==================================================');
  console.log(`  RESULTADO:  ${passed} correctas,  ${failed} fallidas`);
  if (failures.length > 0) {
    console.log('\n  Fallos:');
    failures.forEach((failure) => console.log(`   - ${failure}`));
  }
  console.log('==================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nERROR EN LA PRUEBA:', error.message);
  console.error(error.stack);
  process.exit(1);
});
