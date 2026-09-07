/**
 * Prueba de la capa de tiempo real (Fase 7).
 *
 * Conecta cuatro clientes con roles distintos y comprueba que cada evento
 * llegue SOLO a quien debe: que el operador vea todo, que el ciudadano vea lo
 * suyo, que el personal reciba sus asignaciones y que nadie escuche de mas.
 */

'use strict';

const { io } = require('socket.io-client');

const BASE = 'http://localhost:4000';
const API = `${BASE}/api`;
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

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const login = async (email) => {
  const result = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return result.body?.data?.accessToken;
};

/** Cliente que guarda todo lo que recibe, para revisarlo despues. */
function connect(name, token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    const received = [];

    socket.onAny((event, payload) => received.push({ event, payload }));

    socket.on('connection:ready', (info) => {
      resolve({ name, socket, received, info });
    });

    socket.on('connect_error', (error) => reject(new Error(`${name}: ${error.message}`)));
    setTimeout(() => reject(new Error(`${name}: no conecto en 8 s`)), 8000);
  });
}

/** Espera a que llegue un evento concreto, o null si no llega a tiempo. */
function waitFor(client, event, timeoutMs = 3000) {
  const already = client.received.find((item) => item.event === event);
  if (already) return Promise.resolve(already.payload);

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    client.socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Deja pasar un momento para que se propaguen los eventos. */
const settle = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

const countOf = (client, event) => client.received.filter((i) => i.event === event).length;

async function main() {
  console.log('\n===== 1. AUTENTICACION DEL SOCKET =====');

  // Sin token no se debe poder ni conectar.
  const anonymous = await new Promise((resolve) => {
    const socket = io(BASE, { transports: ['websocket'], reconnection: false });
    socket.on('connect_error', (error) => resolve({ ok: false, message: error.message }));
    socket.on('connect', () => resolve({ ok: true }));
    setTimeout(() => resolve({ ok: false, message: 'timeout' }), 5000);
  });
  check('Socket sin token es rechazado', anonymous.ok === false, anonymous.message);

  const invalid = await new Promise((resolve) => {
    const socket = io(BASE, {
      auth: { token: 'token.completamente.falso' },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect_error', (error) => resolve({ ok: false, message: error.message }));
    socket.on('connect', () => resolve({ ok: true }));
    setTimeout(() => resolve({ ok: false, message: 'timeout' }), 5000);
  });
  check('Socket con token invalido es rechazado', invalid.ok === false, invalid.message);

  console.log('\n===== 2. CONEXION Y SALAS POR ROL =====');

  const operatorToken = await login('operador1@ers.gov.co');
  const citizenToken = await login('maria.ruiz@example.com');
  const otherCitizenToken = await login('jorge.castro@example.com');
  const staffToken = await login('oscar.duarte@ers.gov.co'); // bombero MB-01

  const operator = await connect('operador', operatorToken);
  const citizen = await connect('ciudadano', citizenToken);
  const otherCitizen = await connect('otro ciudadano', otherCitizenToken);
  const staff = await connect('bombero', staffToken);

  check('El operador conecta', Boolean(operator.info));
  check('El operador entra a control-room',
    operator.info.rooms.includes('control-room'), operator.info.rooms.join(','));
  check('El ciudadano NO entra a control-room', !citizen.info.rooms.includes('control-room'));
  check('El ciudadano entra a su canal personal',
    citizen.info.rooms.some((room) => room.startsWith('user:')));
  check('El personal entra a la sala responders',
    staff.info.rooms.includes('responders'), staff.info.rooms.join(','));
  check('El personal se une solo a sus emergencias asignadas',
    staff.info.rooms.some((room) => room.startsWith('emergency:')), staff.info.rooms.join(','));

  console.log('\n===== 3. EMERGENCIA NUEVA =====');

  const created = await api('POST', '/emergencies', {
    token: citizenToken,
    body: {
      title: 'Prueba de tiempo real - accidente',
      description: 'Emergencia creada para verificar Socket.IO.',
      type: 'TRANSITO',
      priority: 'ALTA',
      latitude: 4.1455,
      longitude: -73.6290,
      address: 'Avenida de prueba',
    },
  });
  check('La emergencia se creo por REST', created.status === 201, `status ${created.status}`);
  const emergency = created.body?.data;

  const newForOperator = await waitFor(operator, 'emergency:new');
  check('El operador recibe emergency:new', newForOperator !== null);
  check('El evento trae el codigo', newForOperator?.code === emergency?.code, newForOperator?.code);
  check('El evento trae coordenadas para el mapa',
    newForOperator?.latitude !== undefined && newForOperator?.longitude !== undefined);
  check('El evento trae el color del marcador', Boolean(newForOperator?.priority_color));

  const newForReporter = await waitFor(citizen, 'emergency:new');
  check('El ciudadano que reporto tambien lo recibe', newForReporter !== null);

  await settle();
  check('Un ciudadano ajeno NO recibe emergency:new',
    countOf(otherCitizen, 'emergency:new') === 0,
    `recibio ${countOf(otherCitizen, 'emergency:new')}`);

  check('El operador recibe stats:update', countOf(operator, 'stats:update') > 0);
  check('El ciudadano NO recibe stats:update', countOf(citizen, 'stats:update') === 0);

  const notificationForOperator = await waitFor(operator, 'notification:new');
  check('El operador recibe notification:new', notificationForOperator !== null);
  check('La notificacion trae titulo y mensaje',
    Boolean(notificationForOperator?.title && notificationForOperator?.message));

  console.log('\n===== 4. BOTON SOS =====');

  const sos = await api('POST', '/emergencies/sos', {
    token: citizenToken,
    body: { latitude: 4.1390, longitude: -73.6310 },
  });
  check('El SOS se creo por REST', sos.status === 201, `status ${sos.status}`);

  const sosEvent = await waitFor(operator, 'sos:activated');
  check('El operador recibe sos:activated', sosEvent !== null);
  check('El SOS llega marcado como critico', sosEvent?.priority_code === 'CRITICA', sosEvent?.priority_code);
  check('El SOS llega marcado como is_sos', sosEvent?.is_sos === true);

  await settle();
  check('Un SOS tambien dispara emergency:new',
    countOf(operator, 'emergency:new') === 2,
    `emergency:new recibidos: ${countOf(operator, 'emergency:new')}`);
  check('El ciudadano ajeno NO recibe el SOS',
    countOf(otherCitizen, 'sos:activated') === 0);

  console.log('\n===== 5. SUSCRIPCION AL DETALLE =====');

  const allowed = await new Promise((resolve) => {
    citizen.socket.emit('emergency:subscribe', emergency.id, resolve);
    setTimeout(() => resolve(null), 3000);
  });
  check('El dueño puede suscribirse a su emergencia', allowed?.ok === true, JSON.stringify(allowed));

  const denied = await new Promise((resolve) => {
    otherCitizen.socket.emit('emergency:subscribe', emergency.id, resolve);
    setTimeout(() => resolve(null), 3000);
  });
  check('Un ciudadano ajeno NO puede suscribirse', denied?.ok === false, JSON.stringify(denied));
  check('El rechazo explica el motivo', /permiso/i.test(denied?.message || ''), denied?.message);

  console.log('\n===== 6. ASIGNACION DE PERSONAL =====');

  const availableUnits = await api('GET', '/responders/available?type=BOMBERO', {
    token: operatorToken,
  });
  const unit = availableUnits.body?.data?.[0];
  check('Hay una unidad disponible para asignar', Boolean(unit));

  const staffTokenForUnit = await login(
    unit.unit_code === 'MB-01' ? 'oscar.duarte@ers.gov.co' : 'ricardo.pena@ers.gov.co'
  );
  const assignedStaff =
    unit.unit_code === 'MB-01' ? staff : await connect('bombero asignado', staffTokenForUnit);

  const assign = await api('POST', `/emergencies/${emergency.id}/assign`, {
    token: operatorToken,
    body: { responderIds: [unit.id] },
  });
  check('La asignacion se hizo por REST', assign.status === 200, `status ${assign.status}`);

  const assignedForOperator = await waitFor(operator, 'emergency:assigned');
  check('El operador recibe emergency:assigned', assignedForOperator !== null);
  check('El evento lista las unidades asignadas',
    assignedForOperator?.responders?.length > 0,
    JSON.stringify(assignedForOperator?.responders));

  const assignedForCitizen = await waitFor(citizen, 'emergency:assigned');
  check('El ciudadano recibe que le asignaron personal', assignedForCitizen !== null);

  const assignedForStaff = await waitFor(assignedStaff, 'emergency:assigned');
  check('El bombero asignado recibe el aviso', assignedForStaff !== null);

  const statusEvent = await waitFor(operator, 'responder:status:update');
  check('El operador recibe responder:status:update', statusEvent !== null);
  check('La unidad se anuncia como OCUPADO', statusEvent?.status === 'OCUPADO', statusEvent?.status);

  console.log('\n===== 7. CAMBIO DE ESTADO =====');

  const toProgress = await api('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'EN_PROCESO' },
  });
  check('Cambio a EN_PROCESO por REST', toProgress.status === 200, `status ${toProgress.status}`);

  const statusForOperator = await waitFor(operator, 'emergency:status');
  check('El operador recibe emergency:status', statusForOperator !== null);
  check('El evento dice el estado anterior',
    statusForOperator?.previous_status === 'PENDIENTE', statusForOperator?.previous_status);
  check('El evento dice el estado nuevo',
    statusForOperator?.status_code === 'EN_PROCESO', statusForOperator?.status_code);

  const statusForCitizen = await waitFor(citizen, 'emergency:status');
  check('El ciudadano sigue el estado de su reporte', statusForCitizen !== null);

  const resolve = await api('PATCH', `/emergencies/${emergency.id}/status`, {
    token: operatorToken,
    body: { status: 'RESUELTO', notes: 'Prueba de tiempo real completada.' },
  });
  check('Cambio a RESUELTO por REST', resolve.status === 200, `status ${resolve.status}`);

  const resolvedEvent = await waitFor(operator, 'emergency:resolved');
  check('El operador recibe emergency:resolved', resolvedEvent !== null);

  const resolvedForCitizen = await waitFor(citizen, 'emergency:resolved');
  check('El ciudadano recibe emergency:resolved', resolvedForCitizen !== null);

  console.log('\n===== 8. UBICACION GPS DEL PERSONAL =====');

  const beforeLocation = countOf(operator, 'responder:location:update');

  await api('PATCH', '/responders/me/location', {
    token: staffToken,
    body: { latitude: 4.1512, longitude: -73.6355 },
  });

  const locationEvent = await waitFor(operator, 'responder:location:update');
  check('El operador recibe responder:location:update', locationEvent !== null);
  check('La posicion llega correcta',
    Number(locationEvent?.current_latitude) === 4.1512,
    String(locationEvent?.current_latitude));
  check('El operador recibio un evento nuevo de posicion',
    countOf(operator, 'responder:location:update') > beforeLocation);

  await settle();
  check('El ciudadano NO recibe posiciones del personal',
    countOf(citizen, 'responder:location:update') === 0,
    `recibio ${countOf(citizen, 'responder:location:update')}`);

  console.log('\n===== 9. RESUMEN DE AISLAMIENTO =====');

  const citizenEvents = new Set(citizen.received.map((item) => item.event));
  const otherEvents = new Set(otherCitizen.received.map((item) => item.event));

  console.log(`  Eventos del ciudadano dueño : ${[...citizenEvents].join(', ') || '(ninguno)'}`);
  console.log(`  Eventos del ciudadano ajeno : ${[...otherEvents].join(', ') || '(ninguno)'}`);

  check('El ciudadano ajeno no recibio ningun evento de emergencia',
    ![...otherEvents].some((event) => event.startsWith('emergency:') || event === 'sos:activated'),
    [...otherEvents].join(','));

  [operator, citizen, otherCitizen, staff, assignedStaff].forEach((client) => {
    if (client && client.socket) client.socket.close();
  });

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
