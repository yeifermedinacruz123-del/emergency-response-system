/**
 * Pruebas de seguridad del Emergency Response System (Fase 15).
 *
 * Comprueban propiedades de seguridad contra el sistema en ejecución, no la
 * presencia de código. Cada bloque corresponde a un riesgo concreto.
 *
 * La sección del limitador agota a propósito los intentos de una cuenta que
 * no existe. El bloqueo es por cuenta, así que ninguna cuenta real queda
 * bloqueada y las otras suites pueden correr después. Sigue siendo buena
 * costumbre ejecutarla la última: el tope por IP de /auth es compartido (el
 * contador vive en memoria y se limpia al reiniciar el servidor).
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

async function call(method, path, { token, body, headers = {} } = {}) {
  const allHeaders = { ...headers };
  if (token) allHeaders.Authorization = `Bearer ${token}`;
  if (body) allHeaders['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: allHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  return { status: response.status, body: payload, headers: response.headers };
}

const login = async (email) => {
  const r = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return r.body?.data?.accessToken;
};

async function main() {
  console.log('\n===== 1. CABECERAS DE SEGURIDAD =====');

  const home = await fetch('http://localhost:4000/login.html');
  const csp = home.headers.get('content-security-policy') || '';

  check('Content-Security-Policy presente', csp.length > 0);
  check('CSP restringe el origen por defecto', csp.includes("default-src 'self'"), csp.slice(0, 60));
  check('CSP bloquea objetos incrustados', csp.includes("object-src 'none'"));
  check('CSP impide inyectar <base>', csp.includes("base-uri 'self'"));
  check('X-Content-Type-Options: nosniff', home.headers.get('x-content-type-options') === 'nosniff');
  // El mapa usa tile.openstreetmap.org (sin subdominio): *.tile.openstreetmap.org
  // no lo cubre, y sin el la CSP dejaria el mapa en blanco.
  check('CSP permite las teselas de tile.openstreetmap.org',
    /img-src[^;]*https:\/\/tile\.openstreetmap\.org/.test(csp) && /connect-src[^;]*https:\/\/tile\.openstreetmap\.org/.test(csp));
  check('X-Frame-Options contra clickjacking', Boolean(home.headers.get('x-frame-options')));
  check('Cabecera X-Powered-By oculta', !home.headers.get('x-powered-by'));

  /*
   * En desarrollo NO debe ir upgrade-insecure-requests (helmet la pone por
   * defecto). Con ella, el navegador pide por https:// cada CSS y cada JS de
   * la pagina; contra este servidor, que es HTTP, todos fallan con
   * ERR_SSL_PROTOCOL_ERROR y la aplicacion sale sin estilos.
   *
   * No se notaba por localhost, porque los navegadores eximen a los origenes
   * de confianza. Rompia solo al abrir la PWA desde el telefono por la IP de
   * la red local, que es como se usa en un movil sin cable.
   */
  check(
    'Sin upgrade-insecure-requests en desarrollo (rompe la PWA por IP local)',
    !csp.includes('upgrade-insecure-requests'),
    csp.slice(0, 80)
  );

  console.log('\n===== 2. CONTRASEÑAS =====');

  const admin = await login('admin@ers.gov.co');

  const debiles = [
    ['corta', 'Ab1'],
    ['sin mayuscula', 'contrasena1'],
    ['sin numero', 'ContrasenaSegura'],
    ['solo numeros', '12345678'],
  ];

  for (const [nombre, clave] of debiles) {
    const r = await call('POST', '/users', {
      token: admin,
      body: {
        firstName: 'Prueba', lastName: 'Debil',
        email: `debil.${Date.now()}@ers.gov.co`,
        documentNumber: `D${Date.now()}`.slice(0, 20),
        password: clave, role: 'CIUDADANO',
      },
    });
    check(`Contrasena ${nombre} rechazada`, r.status === 422, `status ${r.status}`);
  }

  const perfil = await call('GET', '/auth/profile', { token: admin });
  check('El perfil no expone el hash de la contrasena',
    perfil.body?.data?.password_hash === undefined);

  const usuarios = await call('GET', '/users?limit=3', { token: admin });
  check('El listado de usuarios tampoco expone hashes',
    usuarios.body?.data?.every((u) => u.password_hash === undefined));

  console.log('\n===== 3. AUTORIZACION =====');

  const citizen = await login('maria.ruiz@example.com');
  const operator = await login('operador1@ers.gov.co');
  const staff = await login('camilo.ospina@ers.gov.co');

  const prohibidos = [
    ['Ciudadano no lista todas las emergencias', citizen, 'GET', '/emergencies'],
    ['Ciudadano no accede a usuarios', citizen, 'GET', '/users'],
    ['Ciudadano no ve estadisticas', citizen, 'GET', '/statistics/dashboard'],
    ['Ciudadano no ve la auditoria', citizen, 'GET', '/audit'],
    ['Ciudadano no ve el mapa general', citizen, 'GET', '/emergencies/map'],
    ['Personal no lista todas las emergencias', staff, 'GET', '/emergencies'],
    ['Personal no accede a usuarios', staff, 'GET', '/users'],
    ['Operador no accede a usuarios', operator, 'GET', '/users'],
    ['Operador no ve la auditoria', operator, 'GET', '/audit'],
    ['Operador no toca la configuracion', operator, 'GET', '/settings'],
  ];

  for (const [nombre, token, method, path] of prohibidos) {
    const r = await call(method, path, { token });
    check(nombre, r.status === 403, `status ${r.status}`);
  }

  console.log('\n===== 4. AISLAMIENTO DE DATOS =====');

  const mias = await call('GET', '/emergencies/mine', { token: citizen });
  const idPropio = mias.body?.data?.[0]?.id;
  const idAjeno = mias.body?.data?.[0]?.reporter_id;

  // Buscar una emergencia que NO sea de esta ciudadana
  const todas = await call('GET', '/emergencies?limit=50', { token: operator });
  const ajena = todas.body?.data?.find((e) => e.reporter_id !== idAjeno);

  check('El ciudadano ve sus propias emergencias', Boolean(idPropio));

  if (ajena) {
    const r = await call('GET', `/emergencies/${ajena.id}`, { token: citizen });
    check('El ciudadano NO accede a una emergencia ajena', r.status === 403, `status ${r.status}`);
  }

  const notis = await call('GET', '/notifications', { token: citizen });
  const otraCiudadana = await login('jorge.castro@example.com');
  const primeraNoti = notis.body?.data?.[0];

  if (primeraNoti) {
    const r = await call('PATCH', `/notifications/${primeraNoti.id}/read`, { token: otraCiudadana });
    check('No se puede marcar la notificacion de otro usuario', r.status === 404, `status ${r.status}`);
  }

  console.log('\n===== 5. TOKENS =====');

  const sinToken = await call('GET', '/auth/profile');
  check('Sin token -> 401', sinToken.status === 401);

  const tokenFalso = await call('GET', '/auth/profile', { token: 'aaa.bbb.ccc' });
  check('Token con formato invalido -> 401', tokenFalso.status === 401);

  // Token firmado con otro secreto: comprueba que la firma se valida de verdad
  const ajenoJwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 1, role: 'ADMINISTRADOR', exp: 9999999999 })).toString('base64url'),
    'firmaInventada',
  ].join('.');

  const falsificado = await call('GET', '/auth/profile', { token: ajenoJwt });
  check('Token con firma falsificada -> 401', falsificado.status === 401, `status ${falsificado.status}`);

  const loginRot = await call('POST', '/auth/login', {
    body: { email: 'operador2@ers.gov.co', password: PASSWORD },
  });
  const refreshToken = loginRot.body?.data?.refreshToken;

  await call('POST', '/auth/refresh', { body: { refreshToken } });
  const reuso = await call('POST', '/auth/refresh', { body: { refreshToken } });
  check('El token de refresco no se puede reutilizar', reuso.status === 401, `status ${reuso.status}`);

  console.log('\n===== 6. VALIDACION Y SANEAMIENTO =====');

  // Intento de inyeccion SQL en un parametro de busqueda
  const inyeccion = await call('GET',
    `/emergencies?search=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`,
    { token: operator });
  check('La inyeccion SQL en la busqueda no rompe la consulta', inyeccion.status === 200,
    `status ${inyeccion.status}`);

  const usuariosVivos = await call('GET', '/users?limit=1', { token: admin });
  check('La tabla de usuarios sigue existiendo tras el intento', usuariosVivos.status === 200);

  // Ordenamiento: solo se aceptan columnas de la lista blanca
  const ordenMalicioso = await call('GET',
    '/emergencies?sort=' + encodeURIComponent('id; DROP TABLE users'),
    { token: operator });
  check('El ordenamiento ignora columnas no permitidas', ordenMalicioso.status === 200,
    `status ${ordenMalicioso.status}`);

  // El texto con etiquetas se guarda tal cual: el escape es responsabilidad
  // de la vista, pero conviene comprobar que no se ejecuta nada en el servidor.
  const conScript = await call('POST', '/emergencies', {
    token: citizen,
    body: {
      title: 'Prueba <script>alert(1)</script> XSS',
      type: 'OTRA',
      latitude: 4.14, longitude: -73.62,
    },
  });
  check('Se acepta texto con etiquetas sin ejecutarlo', conScript.status === 201,
    `status ${conScript.status}`);
  check('El texto se almacena literal, sin interpretarse',
    conScript.body?.data?.title?.includes('<script>'),
    conScript.body?.data?.title);

  console.log('\n===== 7. TRANSICIONES Y REGLAS =====');

  const idNueva = conScript.body?.data?.id;

  const saltoIlegal = await call('PATCH', `/emergencies/${idNueva}/status`, {
    token: operator, body: { status: 'RESUELTO' },
  });
  check('No se puede saltar de PENDIENTE a RESUELTO', saltoIlegal.status === 400);

  const autoDesactivar = await call('PATCH', '/users/1/status', {
    token: admin, body: { isActive: false },
  });
  check('El administrador no puede desactivarse a si mismo', autoDesactivar.status === 400);

  console.log('\n===== 8. SUSCRIPCIONES PUSH =====');

  /*
   * El servidor hace un POST a la URL de cada suscripcion cuando envia un
   * aviso. Si aceptara cualquier URL, un usuario podria apuntarla a la red
   * interna y usar el servidor para llegar a donde el no puede (SSRF).
   */
  const pushKeys = { p256dh: 'BExamplePublicKeyForTesting000000000000000000', auth: 'authSecret000000' };
  const internas = [
    'http://localhost:5432/',
    'https://169.254.169.254/latest/meta-data/',
    'https://fcm.googleapis.com.evil.example/push',
    'ftp://fcm.googleapis.com/push',
  ];
  for (const endpoint of internas) {
    const r = await call('POST', '/notifications/subscribe', {
      token: citizen, body: { endpoint, keys: pushKeys },
    });
    check(`Push: se rechaza el endpoint ${endpoint}`, r.status === 400, `status ${r.status}`);
  }

  const fcmEndpoint = `https://fcm.googleapis.com/fcm/send/prueba-${Date.now()}`;
  const valida = await call('POST', '/notifications/subscribe', {
    token: citizen, body: { endpoint: fcmEndpoint, keys: pushKeys },
  });
  check('Push: se acepta un endpoint de un servicio real', valida.status === 201, `status ${valida.status}`);

  const bajaAjena = await call('DELETE', '/notifications/subscribe', {
    token: otraCiudadana, body: { endpoint: fcmEndpoint },
  });
  check('Push: nadie puede dar de baja el dispositivo de otro',
    bajaAjena.body?.data?.removed === false, JSON.stringify(bajaAjena.body?.data));

  const bajaPropia = await call('DELETE', '/notifications/subscribe', {
    token: citizen, body: { endpoint: fcmEndpoint },
  });
  check('Push: el dueño si puede darse de baja', bajaPropia.body?.data?.removed === true,
    JSON.stringify(bajaPropia.body?.data));

  console.log('\n===== 9. ARCHIVOS SUBIDOS =====');

  const sinFirma = await fetch('http://localhost:4000/uploads/emergencies/ers-1700000000000-0123456789abcdef0123456789abcdef.jpg');
  check('/uploads no es una carpeta publica: sin firma -> 403', sinFirma.status === 403,
    `status ${sinFirma.status}`);
  const recorrido = await fetch('http://localhost:4000/uploads/emergencies/..%2F..%2F.env');
  check('/uploads no permite salir de la carpeta', [400, 403, 404].includes(recorrido.status),
    `status ${recorrido.status}`);

  console.log('\n===== 10. LIMITE GENERAL DE PETICIONES =====');

  /*
   * El cupo general es por usuario (y por IP para quien no tiene sesion).
   * Antes era solo por IP: agotado por cualquiera, dejaba sin servicio a toda
   * la red, y como se aplicaba antes que el limitador propio del SOS, un SOS
   * recibia 429 aunque el diseño decia que eso no podia pasar.
   */
  // Una cuenta creada solo para esto: agotar el cupo de una cuenta de la
  // demostracion la dejaria inservible durante 15 minutos.
  const sello = Date.now();
  await call('POST', '/users', {
    token: admin,
    body: {
      firstName: 'Cupo', lastName: 'Agotado', email: `cupo.${sello}@example.com`,
      documentNumber: `C${sello}`.slice(0, 20), password: PASSWORD, role: 'CIUDADANO',
    },
  });
  const agotadora = await login(`cupo.${sello}@example.com`);

  let agotado = 0;
  for (let i = 1; i <= 2000; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call('GET', '/catalogs/types', { token: agotadora });
    if (r.status === 429) { agotado = i; break; }
  }
  check('El limite general se aplica (cupo agotado)', agotado > 0, `429 tras ${agotado} peticiones`);

  const sosConCupoAgotado = await call('POST', '/emergencies/sos', {
    token: agotadora, body: { latitude: 4.1333, longitude: -73.6111 },
  });
  check('Con el cupo general agotado, el SOS sigue funcionando', sosConCupoAgotado.status === 201,
    `status ${sosConCupoAgotado.status}`);

  const otroUsuario = await call('GET', '/catalogs/types', { token: citizen });
  check('El cupo agotado de un usuario no bloquea a los demas', otroUsuario.status === 200,
    `status ${otroUsuario.status}`);

  const salud = await fetch('http://localhost:4000/api/health');
  check('/api/health no cuenta para el limite', salud.status !== 429, `status ${salud.status}`);

  console.log('\n===== 11. LIMITADOR DE INTENTOS =====');
  console.log('  (agota el limitador de una cuenta inexistente, no el de las reales)');

  const conIpFalsa = [];
  for (let i = 1; i <= 8; i += 1) {
    const r = await call('POST', '/auth/login', {
      headers: { 'X-Forwarded-For': `10.0.0.${i}` },
      // Una cuenta inexistente: el limitador cuenta igual (no revela si el
      // correo existe) y ninguna cuenta real queda bloqueada tras la prueba.
      body: { email: 'fuerza.bruta@ers.gov.co', password: `claveIncorrecta${i}` },
    });
    conIpFalsa.push(r.status);
  }

  const bloqueados = conIpFalsa.filter((s) => s === 429).length;
  check('El limitador NO se puede burlar falseando X-Forwarded-For',
    bloqueados > 0, `respuestas: ${conIpFalsa.join(', ')}`);

  /*
   * No se comprueba en qué intento exacto bloquea: además del límite por
   * cuenta hay un tope por IP para todo /api/auth, y lo que se haya probado
   * antes cuenta para él. Lo que importa es que deje pasar algunos y acabe
   * bloqueando, no el número concreto.
   */
  check('Deja pasar los primeros intentos y luego bloquea',
    conIpFalsa[0] === 401 && bloqueados > 0,
    conIpFalsa.join(', '));

  check('Una vez bloqueado, sigue bloqueando',
    conIpFalsa[conIpFalsa.length - 1] === 429,
    `ultimo: ${conIpFalsa[conIpFalsa.length - 1]}`);

  /*
   * El bloqueo es por cuenta, no por IP: si no, los fallos de una persona
   * dejarian sin acceso a todos los que comparten su red (un salon de clase).
   */
  const otraCuenta = await call('POST', '/auth/login', {
    body: { email: 'operador1@ers.gov.co', password: PASSWORD },
  });
  check('Los fallos de una cuenta no bloquean a otra desde la misma IP',
    otraCuenta.status === 200, `status ${otraCuenta.status}`);

  console.log('\n==================================================');
  console.log(`  SEGURIDAD:  ${passed} correctas,  ${failed} fallidas`);
  if (failures.length > 0) {
    console.log('\n  Fallos:');
    failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('==================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nERROR EN LA PRUEBA:', error.message);
  console.error(error.stack);
  process.exit(1);
});
