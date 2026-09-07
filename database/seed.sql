-- =============================================================================
--  EMERGENCY RESPONSE SYSTEM - Datos de demostracion
--  Contexto geografico: Villavicencio, Meta, Colombia
-- =============================================================================
--  Se ejecuta con:  npm run db:seed   (despues de npm run db:schema)
--
--  IDEMPOTENTE: vacia las tablas transaccionales antes de insertar, asi que se
--  puede volver a ejecutar para dejar la demostracion en su estado inicial.
--
--  CONTRASENA DE TODOS LOS USUARIOS DE PRUEBA:  Emergencia2026*
--  El hash es bcrypt con 12 rondas. Son credenciales de DEMOSTRACION: no deben
--  usarse en un despliegue real.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Limpieza (orden inverso de dependencia)
-- -----------------------------------------------------------------------------
TRUNCATE TABLE
  audit_logs, push_subscriptions, notifications, emergency_history, assignments, photos,
  emergencies, locations, responders, refresh_tokens, users,
  system_settings, zones, priorities, emergency_status, emergency_types, roles,
  emergency_code_counters
RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
--  1. CATALOGOS
-- -----------------------------------------------------------------------------

INSERT INTO roles (id, code, name, description) VALUES
  (1, 'CIUDADANO',     'Ciudadano',     'Reporta emergencias y consulta el estado de sus reportes.'),
  (2, 'PERSONAL',      'Personal de emergencia', 'Atiende las emergencias que le son asignadas.'),
  (3, 'OPERADOR',      'Operador',      'Gestiona emergencias y asigna personal desde el centro de control.'),
  (4, 'ADMINISTRADOR', 'Administrador', 'Administra usuarios, personal, estadisticas y configuracion.');

INSERT INTO emergency_types (id, code, name, description, icon, color) VALUES
  (1, 'MEDICA',           'Emergencia medica',   'Urgencias de salud que requieren atencion inmediata.', '🚑', '#e11d48'),
  (2, 'TRANSITO',         'Accidente de transito','Colisiones, atropellamientos y volcamientos.',        '🚗', '#f59e0b'),
  (3, 'INCENDIO',         'Incendio',            'Fuego estructural, forestal o vehicular.',             '🔥', '#ea580c'),
  (4, 'SEGURIDAD',        'Seguridad',           'Hurtos, rinas y alteraciones del orden publico.',       '🚓', '#2563eb'),
  (5, 'INUNDACION',       'Inundacion',          'Desbordamientos y encharcamientos graves.',            '🌊', '#0891b2'),
  (6, 'DESASTRE_NATURAL', 'Desastre natural',    'Sismos, deslizamientos y vendavales.',                 '⛰️', '#7c3aed'),
  (7, 'OTRA',             'Otra',                'Situaciones que no encajan en las categorias anteriores.', '❗', '#64748b');

INSERT INTO emergency_status (id, code, name, description, color, is_final, sort_order) VALUES
  (1, 'PENDIENTE',  'Pendiente',  'Reportada, aun sin personal asignado.', '#f59e0b', FALSE, 1),
  (2, 'EN_PROCESO', 'En proceso', 'Personal asignado y atendiendo.',       '#2563eb', FALSE, 2),
  (3, 'RESUELTO',   'Resuelto',   'Atendida y cerrada satisfactoriamente.','#16a34a', TRUE,  3),
  (4, 'CANCELADO',  'Cancelado',  'Descartada o cancelada.',               '#64748b', TRUE,  4);

INSERT INTO priorities (id, code, name, color, level, target_minutes) VALUES
  (1, 'BAJA',    'Baja',     '#16a34a', 1, 120),
  (2, 'MEDIA',   'Media',    '#f59e0b', 2, 60),
  (3, 'ALTA',    'Alta',     '#ea580c', 3, 20),
  (4, 'CRITICA', 'Critica',  '#dc2626', 4, 8);

-- Comunas de Villavicencio, con su centro aproximado para el mapa.
INSERT INTO zones (id, code, name, latitude, longitude) VALUES
  (1,  'COMUNA-1', 'Comuna 1 - Centro',            4.1420, -73.6266),
  (2,  'COMUNA-2', 'Comuna 2 - La Esperanza',      4.1512, -73.6390),
  (3,  'COMUNA-3', 'Comuna 3 - La Rosita',         4.1338, -73.6198),
  (4,  'COMUNA-4', 'Comuna 4 - El Barzal',         4.1487, -73.6155),
  (5,  'COMUNA-5', 'Comuna 5 - Porfia',            4.0905, -73.6602),
  (6,  'COMUNA-6', 'Comuna 6 - Popular',           4.1601, -73.6301),
  (7,  'COMUNA-7', 'Comuna 7 - Industrial',        4.1265, -73.6455),
  (8,  'COMUNA-8', 'Comuna 8 - Ciudad Porfia Sur', 4.0788, -73.6710),
  (9,  'RURAL-N',  'Zona rural norte',             4.1890, -73.6020),
  (10, 'RURAL-S',  'Zona rural sur',               4.0650, -73.6850);

-- -----------------------------------------------------------------------------
--  2. USUARIOS
--  Todos comparten la contrasena de demostracion:  Emergencia2026*
-- -----------------------------------------------------------------------------

INSERT INTO users (id, role_id, first_name, last_name, document_type, document_number, email, phone, password_hash, address) VALUES
  -- Administrador
  (1, 4, 'Yeifer',  'Medina',   'CC', '1121854730', 'admin@ers.gov.co',      '3138001001', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Centro de Control ERS, Villavicencio'),
  -- Operadores
  (2, 3, 'Laura',   'Gomez',    'CC', '1121854731', 'operador1@ers.gov.co',  '3138001002', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Centro de Control ERS, Villavicencio'),
  (3, 3, 'Andres',  'Beltran',  'CC', '1121854732', 'operador2@ers.gov.co',  '3138001003', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Centro de Control ERS, Villavicencio'),
  -- Ciudadanos
  (4, 1, 'Maria',   'Ruiz',     'CC', '1121854733', 'maria.ruiz@example.com',    '3138002001', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Calle 15 #22-40, Barrio Centro'),
  (5, 1, 'Jorge',   'Castro',   'CC', '1121854734', 'jorge.castro@example.com',  '3138002002', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Carrera 33 #10-18, La Esperanza'),
  (6, 1, 'Diana',   'Saenz',    'CC', '1121854735', 'diana.saenz@example.com',   '3138002003', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Calle 7 Sur #44-12, Porfia'),
  -- Personal de emergencia
  (7,  2, 'Camilo',  'Ospina',  'CC', '1121854736', 'camilo.ospina@ers.gov.co',  '3138003001', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Base Norte'),
  (8,  2, 'Natalia', 'Rios',    'CC', '1121854737', 'natalia.rios@ers.gov.co',   '3138003002', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Base Sur'),
  (9,  2, 'Oscar',   'Duarte',  'CC', '1121854738', 'oscar.duarte@ers.gov.co',   '3138003003', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Estacion de Bomberos Centro'),
  (10, 2, 'Ricardo', 'Pena',    'CC', '1121854739', 'ricardo.pena@ers.gov.co',   '3138003004', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Estacion de Bomberos Sur'),
  (11, 2, 'Sandra',  'Vargas',  'CC', '1121854740', 'sandra.vargas@ers.gov.co',  '3138003005', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'CAI Centro'),
  (12, 2, 'Julian',  'Torres',  'CC', '1121854741', 'julian.torres@ers.gov.co',  '3138003006', '$2a$12$h8aVlUtR1A8pOuIO1kcrU.Rq9YbESB0v3jV5zNx1DkwFyUwfpU0jG', 'Base de Rescate');

-- -----------------------------------------------------------------------------
--  3. PERSONAL DE EMERGENCIA
-- -----------------------------------------------------------------------------

INSERT INTO responders (id, user_id, responder_type, unit_code, unit_name, institution, status, current_latitude, current_longitude, location_updated_at) VALUES
  (1, 7,  'PARAMEDICO', 'UM-01', 'Unidad Medica 01',   'Secretaria de Salud de Villavicencio', 'OCUPADO',           4.1455, -73.6288, NOW() - INTERVAL '4 minutes'),
  (2, 8,  'PARAMEDICO', 'UM-03', 'Unidad Medica 03',   'Secretaria de Salud de Villavicencio', 'DISPONIBLE',        4.0952, -73.6588, NOW() - INTERVAL '2 minutes'),
  (3, 9,  'BOMBERO',    'MB-01', 'Maquina Bomberos 01','Bomberos Villavicencio',              'OCUPADO',           4.1372, -73.6231, NOW() - INTERVAL '3 minutes'),
  (4, 10, 'BOMBERO',    'MB-02', 'Maquina Bomberos 02','Bomberos Villavicencio',              'DISPONIBLE',        4.0821, -73.6688, NOW() - INTERVAL '7 minutes'),
  (5, 11, 'POLICIA',    'PT-05', 'Patrulla 05',        'Policia Metropolitana',               'OCUPADO',           4.1408, -73.6244, NOW() - INTERVAL '1 minute'),
  (6, 12, 'RESCATISTA', 'RS-02', 'Grupo Rescate 02',   'Defensa Civil Colombiana',            'FUERA_DE_SERVICIO', 4.1520, -73.6400, NOW() - INTERVAL '3 hours');

-- -----------------------------------------------------------------------------
--  4. UBICACIONES
--  Una por emergencia, repartidas por las comunas de Villavicencio.
-- -----------------------------------------------------------------------------

INSERT INTO locations (id, latitude, longitude, address, reference, zone_id, accuracy_m) VALUES
  (1,  4.1433, -73.6291, 'Avenida 40 con Calle 15',            'Frente al centro comercial',        1, 12.0),
  (2,  4.1502, -73.6372, 'Carrera 33 con Calle 22',            'Andes del parque principal',        2, 8.5),
  (3,  4.1281, -73.6448, 'Zona industrial, Calle 8 Sur',       'Bodega de materiales',              7, 15.0),
  (4,  4.1345, -73.6205, 'Parque La Rosita',                   'Cerca de la cancha',                3, 10.0),
  (5,  4.1495, -73.6162, 'Barrio El Barzal, Calle 37',         'Edificio residencial, piso 3',      4, 9.0),
  (6,  4.1418, -73.6270, 'Calle 15 con Carrera 30',            'Semaforo principal',                1, 20.0),
  (7,  4.1520, -73.6398, 'Cano Maizaro, sector norte',         'Puente peatonal',                   2, 18.0),
  (8,  4.0918, -73.6595, 'Ciudad Porfia, Manzana 12',          'Tienda de la esquina',              5, 11.0),
  (9,  4.1367, -73.6222, 'Barrio La Rosita, Calle 12',         'Casa de dos pisos',                 3, 7.5),
  (10, 4.1442, -73.6310, 'Centro, Carrera 29 con Calle 18',    'Zona de bares',                     1, 13.0),
  (11, 4.1258, -73.6462, 'Anillo vial, kilometro 3',           'Curva pronunciada',                 7, 22.0),
  (12, 4.1885, -73.6035, 'Vereda Buenavista',                  'Talud sobre la via',                9, 30.0),
  (13, 4.1610, -73.6295, 'Barrio Popular, Calle 44',           'Escalera de acceso',                6, 9.5),
  (14, 4.0895, -73.6620, 'Ciudad Porfia, Calle 7 Sur',         'Vivienda de un piso',               5, 14.0),
  (15, 4.1425, -73.6258, 'Centro administrativo',              'Ventanilla de atencion',            1, 6.0),
  (16, 4.0801, -73.6702, 'Via Puerto Lopez, kilometro 6',      'Vehiculo de carga volcado',         8, 25.0),
  (17, 4.1478, -73.6178, 'El Barzal, Carrera 35',              'Oficina en segundo piso',           4, 8.0),
  (18, 4.1295, -73.6438, 'Zona industrial, bodega 14',         'Deposito de pintura',               7, 16.0),
  (19, 4.1462, -73.6325, 'Avenida 40 con Carrera 26',          'Frente a la estacion de servicio',  1, 12.5),
  (20, 4.1338, -73.6215, 'Barrio La Rosita, Calle 10',         'Frente a la panaderia',             3, 7.0),
  (21, 4.1548, -73.6382, 'La Esperanza, Calle 26',             'Salon comunal',                     2, 10.5),
  (22, 4.1602, -73.6288, 'Barrio Popular, Carrera 41',         'Casa esquinera',                    6, 9.0),
  (23, 4.1245, -73.6470, 'Anillo vial, kilometro 5',           'Puente vehicular',                  7, 19.0),
  (24, 4.0662, -73.6832, 'Vereda Santa Rosa',                  'Camino destapado',                 10, 28.0),
  (25, 4.1410, -73.6302, 'Centro, Calle 20 con Carrera 31',    'Paradero de buses',                 1, 8.0);

-- -----------------------------------------------------------------------------
--  5. EMERGENCIAS
--  25 reportes repartidos en los ultimos 30 dias y en los cuatro estados.
--  Las resueltas y canceladas son antiguas; las activas son de las ultimas
--  horas, para que el dashboard se vea realista.
-- -----------------------------------------------------------------------------

INSERT INTO emergencies
  (id, user_id, type_id, status_id, priority_id, location_id, title, description, is_sos,
   reported_at, assigned_at, in_progress_at, resolved_at, closed_at, resolution_notes, cancel_reason)
VALUES
  -- ---------- RESUELTAS ----------
  (1, 4, 2, 3, 3, 1, 'Choque multiple en la Avenida 40',
   'Colision entre tres vehiculos. Dos personas con heridas leves.', FALSE,
   NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days' + INTERVAL '9 minutes',
   NOW() - INTERVAL '28 days' + INTERVAL '21 minutes', NOW() - INTERVAL '28 days' + INTERVAL '1 hour 35 minutes',
   NOW() - INTERVAL '28 days' + INTERVAL '1 hour 35 minutes',
   'Heridos trasladados. Via despejada y transito normalizado.', NULL),

  (2, 5, 1, 3, 4, 2, 'Persona inconsciente en via publica',
   'Hombre adulto sin respuesta sobre el anden. Activado desde el boton SOS.', TRUE,
   NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' + INTERVAL '4 minutes',
   NOW() - INTERVAL '27 days' + INTERVAL '11 minutes', NOW() - INTERVAL '27 days' + INTERVAL '58 minutes',
   NOW() - INTERVAL '27 days' + INTERVAL '58 minutes',
   'Paciente estabilizado y trasladado al hospital departamental.', NULL),

  (3, 6, 3, 3, 4, 3, 'Incendio estructural en bodega',
   'Fuego en bodega de materiales de construccion. Riesgo de propagacion.', FALSE,
   NOW() - INTERVAL '26 days', NOW() - INTERVAL '26 days' + INTERVAL '6 minutes',
   NOW() - INTERVAL '26 days' + INTERVAL '19 minutes', NOW() - INTERVAL '26 days' + INTERVAL '3 hours 40 minutes',
   NOW() - INTERVAL '26 days' + INTERVAL '3 hours 40 minutes',
   'Incendio controlado y extinguido. Sin personas lesionadas.', NULL),

  (4, 4, 4, 3, 2, 4, 'Hurto a persona en el parque',
   'Robo de pertenencias a un transeunte. Los responsables huyeron.', FALSE,
   NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days' + INTERVAL '14 minutes',
   NOW() - INTERVAL '25 days' + INTERVAL '30 minutes', NOW() - INTERVAL '25 days' + INTERVAL '1 hour 50 minutes',
   NOW() - INTERVAL '25 days' + INTERVAL '1 hour 50 minutes',
   'Se recibio la denuncia y se aumento el patrullaje en el sector.', NULL),

  (5, 5, 1, 3, 3, 5, 'Dificultad respiratoria en adulto mayor',
   'Mujer de 78 anos con dificultad para respirar y antecedentes cardiacos.', FALSE,
   NOW() - INTERVAL '23 days', NOW() - INTERVAL '23 days' + INTERVAL '7 minutes',
   NOW() - INTERVAL '23 days' + INTERVAL '16 minutes', NOW() - INTERVAL '23 days' + INTERVAL '1 hour 12 minutes',
   NOW() - INTERVAL '23 days' + INTERVAL '1 hour 12 minutes',
   'Paciente estabilizada en sitio y trasladada para valoracion.', NULL),

  (7, 6, 5, 3, 3, 7, 'Desbordamiento del cano Maizaro',
   'El cano se desbordo por las lluvias y afecta cinco viviendas.', FALSE,
   NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days' + INTERVAL '12 minutes',
   NOW() - INTERVAL '20 days' + INTERVAL '28 minutes', NOW() - INTERVAL '20 days' + INTERVAL '4 hours 15 minutes',
   NOW() - INTERVAL '20 days' + INTERVAL '4 hours 15 minutes',
   'Familias evacuadas y reubicadas temporalmente. Nivel del agua bajo.', NULL),

  (8, 4, 1, 3, 4, 8, 'Emergencia medica en Ciudad Porfia',
   'Activacion del boton SOS. Persona con convulsiones.', TRUE,
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days' + INTERVAL '3 minutes',
   NOW() - INTERVAL '18 days' + INTERVAL '9 minutes', NOW() - INTERVAL '18 days' + INTERVAL '52 minutes',
   NOW() - INTERVAL '18 days' + INTERVAL '52 minutes',
   'Paciente atendido y trasladado. Familiares informados.', NULL),

  (9, 5, 3, 3, 3, 9, 'Conato de incendio en cocina',
   'Fuego iniciado por una fuga de gas domiciliario.', FALSE,
   NOW() - INTERVAL '17 days', NOW() - INTERVAL '17 days' + INTERVAL '8 minutes',
   NOW() - INTERVAL '17 days' + INTERVAL '18 minutes', NOW() - INTERVAL '17 days' + INTERVAL '1 hour 25 minutes',
   NOW() - INTERVAL '17 days' + INTERVAL '1 hour 25 minutes',
   'Conato extinguido. Se cerro el suministro de gas de la vivienda.', NULL),

  (10, 6, 4, 3, 3, 10, 'Rina en zona de bares',
   'Alteracion del orden publico con varias personas involucradas.', FALSE,
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days' + INTERVAL '5 minutes',
   NOW() - INTERVAL '15 days' + INTERVAL '13 minutes', NOW() - INTERVAL '15 days' + INTERVAL '1 hour 5 minutes',
   NOW() - INTERVAL '15 days' + INTERVAL '1 hour 5 minutes',
   'Situacion controlada. Dos personas conducidas a la estacion.', NULL),

  (11, 4, 2, 3, 3, 11, 'Motociclista lesionado en el anillo vial',
   'Caida de motocicleta en curva. Conductor consciente con trauma en pierna.', FALSE,
   NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' + INTERVAL '10 minutes',
   NOW() - INTERVAL '14 days' + INTERVAL '22 minutes', NOW() - INTERVAL '14 days' + INTERVAL '1 hour 18 minutes',
   NOW() - INTERVAL '14 days' + INTERVAL '1 hour 18 minutes',
   'Paciente inmovilizado y trasladado. Via señalizada.', NULL),

  (13, 5, 1, 3, 2, 13, 'Caida con posible fractura',
   'Persona mayor que cayo por unas escaleras. Dolor en el brazo derecho.', FALSE,
   NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days' + INTERVAL '15 minutes',
   NOW() - INTERVAL '11 days' + INTERVAL '34 minutes', NOW() - INTERVAL '11 days' + INTERVAL '1 hour 40 minutes',
   NOW() - INTERVAL '11 days' + INTERVAL '1 hour 40 minutes',
   'Inmovilizacion del miembro y traslado para radiografia.', NULL),

  (14, 6, 5, 3, 3, 14, 'Inundacion en vivienda',
   'Agua dentro de la casa tras dos horas de lluvia intensa.', FALSE,
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days' + INTERVAL '18 minutes',
   NOW() - INTERVAL '10 days' + INTERVAL '40 minutes', NOW() - INTERVAL '10 days' + INTERVAL '3 hours 10 minutes',
   NOW() - INTERVAL '10 days' + INTERVAL '3 hours 10 minutes',
   'Se evacuo el agua y se despejo el sumidero obstruido.', NULL),

  (16, 4, 2, 3, 4, 16, 'Volcamiento de vehiculo de carga',
   'Camion volcado en la via a Puerto Lopez. Via parcialmente cerrada.', FALSE,
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '7 minutes',
   NOW() - INTERVAL '8 days' + INTERVAL '20 minutes', NOW() - INTERVAL '8 days' + INTERVAL '4 hours 45 minutes',
   NOW() - INTERVAL '8 days' + INTERVAL '4 hours 45 minutes',
   'Conductor rescatado. Carga retirada y via habilitada.', NULL),

  (17, 5, 1, 3, 3, 17, 'Dolor toracico en oficina',
   'Hombre de 54 anos con dolor en el pecho y sudoracion.', FALSE,
   NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '5 minutes',
   NOW() - INTERVAL '6 days' + INTERVAL '12 minutes', NOW() - INTERVAL '6 days' + INTERVAL '55 minutes',
   NOW() - INTERVAL '6 days' + INTERVAL '55 minutes',
   'Electrocardiograma en sitio y traslado prioritario.', NULL),

  -- ---------- CANCELADAS ----------
  (6, 4, 2, 4, 2, 6, 'Reporte de accidente sin confirmar',
   'Llamada sobre un posible accidente en el semaforo principal.', FALSE,
   NOW() - INTERVAL '22 days', NULL, NULL, NULL, NOW() - INTERVAL '22 days' + INTERVAL '25 minutes',
   NULL, 'No se encontro ningun accidente en el sitio. Reporte descartado.'),

  (12, 6, 6, 4, 2, 12, 'Posible deslizamiento en vereda Buenavista',
   'Reporte de movimiento de tierra sobre la via.', FALSE,
   NOW() - INTERVAL '13 days', NULL, NULL, NULL, NOW() - INTERVAL '13 days' + INTERVAL '48 minutes',
   NULL, 'Se verifico el talud y no hay riesgo. Falsa alarma.'),

  (15, 5, 7, 4, 1, 15, 'Solicitud de informacion',
   'El ciudadano solicita informacion sobre tramites, no es una emergencia.', FALSE,
   NOW() - INTERVAL '9 days', NULL, NULL, NULL, NOW() - INTERVAL '9 days' + INTERVAL '10 minutes',
   NULL, 'No corresponde a una emergencia. Se remitio a la linea de atencion.'),

  -- ---------- EN PROCESO ----------
  (18, 6, 3, 2, 4, 18, 'Incendio en deposito de pintura',
   'Humo denso saliendo de la bodega 14. Material inflamable en el sitio.', FALSE,
   NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours' + INTERVAL '6 minutes',
   NOW() - INTERVAL '5 hours' + INTERVAL '17 minutes', NULL, NULL, NULL, NULL),

  (19, 4, 2, 2, 3, 19, 'Colision en la Avenida 40',
   'Choque entre un automovil y una motocicleta frente a la estacion de servicio.', FALSE,
   NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours' + INTERVAL '8 minutes',
   NOW() - INTERVAL '3 hours' + INTERVAL '19 minutes', NULL, NULL, NULL, NULL),

  (20, 5, 1, 2, 4, 20, 'SOS - Persona con herida grave',
   'Activacion del boton SOS. Sangrado abundante en la pierna.', TRUE,
   NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '3 minutes',
   NOW() - INTERVAL '2 hours' + INTERVAL '9 minutes', NULL, NULL, NULL, NULL),

  (21, 6, 4, 2, 2, 21, 'Alteracion del orden en salon comunal',
   'Discusion entre varias personas durante una reunion vecinal.', FALSE,
   NOW() - INTERVAL '90 minutes', NOW() - INTERVAL '90 minutes' + INTERVAL '11 minutes',
   NOW() - INTERVAL '90 minutes' + INTERVAL '24 minutes', NULL, NULL, NULL, NULL),

  -- ---------- PENDIENTES ----------
  (22, 4, 1, 1, 3, 22, 'Persona con mareo severo',
   'Mujer adulta con mareo intenso y vision borrosa.', FALSE,
   NOW() - INTERVAL '45 minutes', NULL, NULL, NULL, NULL, NULL, NULL),

  (23, 5, 2, 1, 2, 23, 'Vehiculo varado en el puente',
   'Automovil detenido en el carril derecho, obstruyendo el paso.', FALSE,
   NOW() - INTERVAL '25 minutes', NULL, NULL, NULL, NULL, NULL, NULL),

  (24, 6, 5, 1, 3, 24, 'Via destapada anegada',
   'El camino de la vereda esta cubierto de agua y no permite el paso.', FALSE,
   NOW() - INTERVAL '12 minutes', NULL, NULL, NULL, NULL, NULL, NULL),

  (25, 4, 1, 1, 4, 25, 'SOS - Desmayo en paradero de buses',
   'Activacion del boton SOS. Persona desmayada en el paradero.', TRUE,
   NOW() - INTERVAL '4 minutes', NULL, NULL, NULL, NULL, NULL, NULL);

/*
 * Los codigos NO se escriben aqui: el trigger trg_emergencies_code los genera
 * al insertar (ERS-2026-000001, 000002, ...) y de paso deja el contador
 * emergency_code_counters alineado. Asi los datos de demostracion tambien
 * sirven para comprobar que el trigger funciona.
 */

-- -----------------------------------------------------------------------------
--  6. ASIGNACIONES
--  Cada emergencia atendida tiene la unidad que corresponde a su tipo.
-- -----------------------------------------------------------------------------

INSERT INTO assignments (emergency_id, responder_id, assigned_by, status, assigned_at, en_route_at, on_site_at, completed_at, notes) VALUES
  -- Resueltas: ciclo completo
  (1,  1, 2, 'COMPLETADO', NOW() - INTERVAL '28 days' + INTERVAL '9 minutes',  NOW() - INTERVAL '28 days' + INTERVAL '12 minutes', NOW() - INTERVAL '28 days' + INTERVAL '21 minutes', NOW() - INTERVAL '28 days' + INTERVAL '1 hour 35 minutes', 'Atencion de heridos leves en el sitio.'),
  (1,  5, 2, 'COMPLETADO', NOW() - INTERVAL '28 days' + INTERVAL '10 minutes', NOW() - INTERVAL '28 days' + INTERVAL '13 minutes', NOW() - INTERVAL '28 days' + INTERVAL '22 minutes', NOW() - INTERVAL '28 days' + INTERVAL '1 hour 35 minutes', 'Control del transito y señalizacion.'),
  (2,  1, 2, 'COMPLETADO', NOW() - INTERVAL '27 days' + INTERVAL '4 minutes',  NOW() - INTERVAL '27 days' + INTERVAL '6 minutes',  NOW() - INTERVAL '27 days' + INTERVAL '11 minutes', NOW() - INTERVAL '27 days' + INTERVAL '58 minutes', 'Reanimacion y traslado.'),
  (3,  3, 3, 'COMPLETADO', NOW() - INTERVAL '26 days' + INTERVAL '6 minutes',  NOW() - INTERVAL '26 days' + INTERVAL '9 minutes',  NOW() - INTERVAL '26 days' + INTERVAL '19 minutes', NOW() - INTERVAL '26 days' + INTERVAL '3 hours 40 minutes', 'Extincion del incendio.'),
  (3,  4, 3, 'COMPLETADO', NOW() - INTERVAL '26 days' + INTERVAL '7 minutes',  NOW() - INTERVAL '26 days' + INTERVAL '11 minutes', NOW() - INTERVAL '26 days' + INTERVAL '24 minutes', NOW() - INTERVAL '26 days' + INTERVAL '3 hours 40 minutes', 'Apoyo con segunda maquina.'),
  (4,  5, 2, 'COMPLETADO', NOW() - INTERVAL '25 days' + INTERVAL '14 minutes', NOW() - INTERVAL '25 days' + INTERVAL '18 minutes', NOW() - INTERVAL '25 days' + INTERVAL '30 minutes', NOW() - INTERVAL '25 days' + INTERVAL '1 hour 50 minutes', 'Recepcion de la denuncia.'),
  (5,  2, 2, 'COMPLETADO', NOW() - INTERVAL '23 days' + INTERVAL '7 minutes',  NOW() - INTERVAL '23 days' + INTERVAL '10 minutes', NOW() - INTERVAL '23 days' + INTERVAL '16 minutes', NOW() - INTERVAL '23 days' + INTERVAL '1 hour 12 minutes', 'Oxigenoterapia y traslado.'),
  (7,  6, 3, 'COMPLETADO', NOW() - INTERVAL '20 days' + INTERVAL '12 minutes', NOW() - INTERVAL '20 days' + INTERVAL '17 minutes', NOW() - INTERVAL '20 days' + INTERVAL '28 minutes', NOW() - INTERVAL '20 days' + INTERVAL '4 hours 15 minutes', 'Evacuacion de familias.'),
  (8,  2, 2, 'COMPLETADO', NOW() - INTERVAL '18 days' + INTERVAL '3 minutes',  NOW() - INTERVAL '18 days' + INTERVAL '5 minutes',  NOW() - INTERVAL '18 days' + INTERVAL '9 minutes',  NOW() - INTERVAL '18 days' + INTERVAL '52 minutes', 'Manejo de crisis convulsiva.'),
  (9,  3, 3, 'COMPLETADO', NOW() - INTERVAL '17 days' + INTERVAL '8 minutes',  NOW() - INTERVAL '17 days' + INTERVAL '12 minutes', NOW() - INTERVAL '17 days' + INTERVAL '18 minutes', NOW() - INTERVAL '17 days' + INTERVAL '1 hour 25 minutes', 'Extincion y cierre de gas.'),
  (10, 5, 2, 'COMPLETADO', NOW() - INTERVAL '15 days' + INTERVAL '5 minutes',  NOW() - INTERVAL '15 days' + INTERVAL '8 minutes',  NOW() - INTERVAL '15 days' + INTERVAL '13 minutes', NOW() - INTERVAL '15 days' + INTERVAL '1 hour 5 minutes', 'Control de la rina.'),
  (11, 1, 2, 'COMPLETADO', NOW() - INTERVAL '14 days' + INTERVAL '10 minutes', NOW() - INTERVAL '14 days' + INTERVAL '14 minutes', NOW() - INTERVAL '14 days' + INTERVAL '22 minutes', NOW() - INTERVAL '14 days' + INTERVAL '1 hour 18 minutes', 'Inmovilizacion y traslado.'),
  (13, 2, 3, 'COMPLETADO', NOW() - INTERVAL '11 days' + INTERVAL '15 minutes', NOW() - INTERVAL '11 days' + INTERVAL '21 minutes', NOW() - INTERVAL '11 days' + INTERVAL '34 minutes', NOW() - INTERVAL '11 days' + INTERVAL '1 hour 40 minutes', 'Sospecha de fractura de humero.'),
  (14, 6, 3, 'COMPLETADO', NOW() - INTERVAL '10 days' + INTERVAL '18 minutes', NOW() - INTERVAL '10 days' + INTERVAL '26 minutes', NOW() - INTERVAL '10 days' + INTERVAL '40 minutes', NOW() - INTERVAL '10 days' + INTERVAL '3 hours 10 minutes', 'Evacuacion del agua.'),
  (16, 4, 2, 'COMPLETADO', NOW() - INTERVAL '8 days'  + INTERVAL '7 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '12 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '20 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '4 hours 45 minutes', 'Rescate del conductor.'),
  (16, 1, 2, 'COMPLETADO', NOW() - INTERVAL '8 days'  + INTERVAL '9 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '14 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '23 minutes',  NOW() - INTERVAL '8 days' + INTERVAL '4 hours 45 minutes', 'Valoracion medica del conductor.'),
  (17, 1, 3, 'COMPLETADO', NOW() - INTERVAL '6 days'  + INTERVAL '5 minutes',  NOW() - INTERVAL '6 days' + INTERVAL '7 minutes',   NOW() - INTERVAL '6 days' + INTERVAL '12 minutes',  NOW() - INTERVAL '6 days' + INTERVAL '55 minutes', 'Electrocardiograma y traslado.'),

  -- En proceso: sin completed_at
  (18, 3, 2, 'EN_SITIO', NOW() - INTERVAL '5 hours'     + INTERVAL '6 minutes',  NOW() - INTERVAL '5 hours' + INTERVAL '10 minutes',    NOW() - INTERVAL '5 hours' + INTERVAL '17 minutes', NULL, 'Atacando el fuego por el costado norte.'),
  (19, 5, 2, 'EN_SITIO', NOW() - INTERVAL '3 hours'     + INTERVAL '8 minutes',  NOW() - INTERVAL '3 hours' + INTERVAL '12 minutes',    NOW() - INTERVAL '3 hours' + INTERVAL '19 minutes', NULL, 'Regulando el transito en la avenida.'),
  (20, 1, 3, 'EN_SITIO', NOW() - INTERVAL '2 hours'     + INTERVAL '3 minutes',  NOW() - INTERVAL '2 hours' + INTERVAL '5 minutes',     NOW() - INTERVAL '2 hours' + INTERVAL '9 minutes',  NULL, 'Control de hemorragia en el sitio.'),
  (21, 5, 3, 'EN_CAMINO', NOW() - INTERVAL '90 minutes' + INTERVAL '11 minutes', NOW() - INTERVAL '90 minutes' + INTERVAL '24 minutes', NULL, NULL, 'Patrulla desplazandose al salon comunal.');

-- -----------------------------------------------------------------------------
--  7. HISTORIAL
--  Se genera a partir de las marcas de tiempo de cada emergencia, para que la
--  linea de tiempo siempre coincida con los datos reales.
-- -----------------------------------------------------------------------------

-- Creacion
INSERT INTO emergency_history (emergency_id, user_id, status_id, action, description, created_at)
SELECT e.id, e.user_id, 1, 'CREADA',
       CASE WHEN e.is_sos
            THEN 'Emergencia SOS activada por el ciudadano'
            ELSE 'Emergencia reportada por el ciudadano' END,
       e.reported_at
FROM emergencies e;

-- Asignacion
INSERT INTO emergency_history (emergency_id, user_id, status_id, action, description, created_at)
SELECT e.id, 2, 1, 'ASIGNADA', 'Personal asignado desde el centro de control', e.assigned_at
FROM emergencies e
WHERE e.assigned_at IS NOT NULL;

-- Paso a EN_PROCESO
INSERT INTO emergency_history (emergency_id, user_id, status_id, action, description, created_at)
SELECT e.id, 2, 2, 'ESTADO_CAMBIADO', 'La emergencia paso a EN PROCESO: personal en el sitio', e.in_progress_at
FROM emergencies e
WHERE e.in_progress_at IS NOT NULL;

-- Resolucion
INSERT INTO emergency_history (emergency_id, user_id, status_id, action, description, created_at)
SELECT e.id, 2, 3, 'RESUELTA', COALESCE(e.resolution_notes, 'Emergencia resuelta'), e.resolved_at
FROM emergencies e
WHERE e.resolved_at IS NOT NULL;

-- Cancelacion
INSERT INTO emergency_history (emergency_id, user_id, status_id, action, description, created_at)
SELECT e.id, 2, 4, 'CANCELADA', COALESCE(e.cancel_reason, 'Emergencia cancelada'), e.closed_at
FROM emergencies e
WHERE e.status_id = 4 AND e.closed_at IS NOT NULL;

-- -----------------------------------------------------------------------------
--  8. NOTIFICACIONES
--  Bandeja de los ciudadanos que reportaron cada emergencia.
-- -----------------------------------------------------------------------------

INSERT INTO notifications (user_id, emergency_id, type, title, message, icon, is_read, read_at, created_at)
SELECT e.user_id, e.id, 'EMERGENCIA_NUEVA', 'Reporte recibido',
       'Tu reporte ' || e.code || ' fue recibido por el centro de control.',
       '🚨', e.status_id IN (3, 4), CASE WHEN e.status_id IN (3, 4) THEN e.closed_at END, e.reported_at
FROM emergencies e;

INSERT INTO notifications (user_id, emergency_id, type, title, message, icon, is_read, read_at, created_at)
SELECT e.user_id, e.id, 'PERSONAL_ASIGNADO', 'Personal asignado',
       'Se asigno personal de emergencia a tu reporte ' || e.code || '.',
       '🚑', e.status_id IN (3, 4), CASE WHEN e.status_id IN (3, 4) THEN e.closed_at END, e.assigned_at
FROM emergencies e
WHERE e.assigned_at IS NOT NULL;

INSERT INTO notifications (user_id, emergency_id, type, title, message, icon, is_read, read_at, created_at)
SELECT e.user_id, e.id, 'EMERGENCIA_RESUELTA', 'Emergencia resuelta',
       'Tu reporte ' || e.code || ' fue atendido y cerrado.',
       '✅', TRUE, e.resolved_at, e.resolved_at
FROM emergencies e
WHERE e.resolved_at IS NOT NULL;

-- -----------------------------------------------------------------------------
--  9. AUDITORIA
-- -----------------------------------------------------------------------------

INSERT INTO audit_logs (user_id, action, entity, entity_id, description, created_at) VALUES
  (1, 'LOGIN',         'users',       1, 'Inicio de sesion del administrador',        NOW() - INTERVAL '2 hours'),
  (2, 'LOGIN',         'users',       2, 'Inicio de sesion del operador',             NOW() - INTERVAL '5 hours'),
  (2, 'ASIGNAR',       'emergencies', 20, 'Asignacion de la unidad UM-01 al SOS',     NOW() - INTERVAL '2 hours'),
  (2, 'CAMBIO_ESTADO', 'emergencies', 18, 'Cambio de estado a EN_PROCESO',            NOW() - INTERVAL '5 hours'),
  (1, 'CREAR',         'users',      12, 'Creacion del usuario Julian Torres',        NOW() - INTERVAL '9 days'),
  (1, 'CAMBIO_ROL',    'users',       3, 'Asignacion del rol OPERADOR',               NOW() - INTERVAL '20 days');

-- -----------------------------------------------------------------------------
--  10. CONFIGURACION DEL SISTEMA
-- -----------------------------------------------------------------------------

INSERT INTO system_settings (key, value, data_type, description, updated_by) VALUES
  ('app.name',                 'Emergency Response System', 'string',  'Nombre visible del sistema.',                    1),
  ('app.city',                 'Villavicencio',             'string',  'Ciudad de operacion.',                           1),
  ('map.center.lat',           '4.1420',                    'number',  'Latitud del centro del mapa.',                   1),
  ('map.center.lng',           '-73.6266',                  'number',  'Longitud del centro del mapa.',                  1),
  ('map.zoom',                 '13',                        'number',  'Zoom inicial del mapa.',                         1),
  ('sos.auto_priority',        'CRITICA',                   'string',  'Prioridad asignada automaticamente a un SOS.',   1),
  ('emergency.max_photos',     '5',                         'number',  'Maximo de fotografias por emergencia.',          1),
  ('notifications.push_enabled','false',                    'boolean', 'Envio de notificaciones push (requiere FCM).',   1);

-- -----------------------------------------------------------------------------
--  11. SECUENCIAS
--  Se alinean con los ids insertados manualmente para que los proximos INSERT
--  del sistema no choquen con una clave primaria ya usada.
-- -----------------------------------------------------------------------------

SELECT setval('roles_id_seq',            (SELECT MAX(id) FROM roles));
SELECT setval('emergency_types_id_seq',  (SELECT MAX(id) FROM emergency_types));
SELECT setval('emergency_status_id_seq', (SELECT MAX(id) FROM emergency_status));
SELECT setval('priorities_id_seq',       (SELECT MAX(id) FROM priorities));
SELECT setval('zones_id_seq',            (SELECT MAX(id) FROM zones));
SELECT setval('users_id_seq',            (SELECT MAX(id) FROM users));
SELECT setval('responders_id_seq',       (SELECT MAX(id) FROM responders));
SELECT setval('locations_id_seq',        (SELECT MAX(id) FROM locations));
SELECT setval('emergencies_id_seq',      (SELECT MAX(id) FROM emergencies));
