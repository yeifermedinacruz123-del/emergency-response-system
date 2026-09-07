-- =============================================================================
--  EMERGENCY RESPONSE SYSTEM - Esquema de base de datos
--  PostgreSQL 16
-- =============================================================================
--  Se ejecuta con:  npm run db:schema
--
--  El archivo es IDEMPOTENTE: se puede volver a ejecutar sin error porque
--  empieza eliminando los objetos en orden inverso de dependencia.
--
--  Orden del archivo:
--    1. Limpieza
--    2. Funciones y triggers
--    3. Catalogos
--    4. Entidades principales
--    5. Entidades dependientes
--    6. Indices
--    7. Vistas
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. LIMPIEZA  (orden inverso al de creacion)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_response_time        CASCADE;
DROP VIEW IF EXISTS v_dashboard_counters   CASCADE;
DROP VIEW IF EXISTS v_responders_full      CASCADE;
DROP VIEW IF EXISTS v_emergencies_full     CASCADE;

DROP TABLE IF EXISTS push_subscriptions     CASCADE;
DROP TABLE IF EXISTS audit_logs            CASCADE;
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS emergency_messages    CASCADE;
DROP TABLE IF EXISTS emergency_history     CASCADE;
DROP TABLE IF EXISTS assignments           CASCADE;
DROP TABLE IF EXISTS photos                CASCADE;
DROP TABLE IF EXISTS emergencies           CASCADE;
DROP TABLE IF EXISTS emergency_code_counters CASCADE;
DROP TABLE IF EXISTS locations             CASCADE;
DROP TABLE IF EXISTS responders            CASCADE;
DROP TABLE IF EXISTS trusted_contacts      CASCADE;
DROP TABLE IF EXISTS password_resets       CASCADE;
DROP TABLE IF EXISTS refresh_tokens        CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;
DROP TABLE IF EXISTS system_settings       CASCADE;
DROP TABLE IF EXISTS zones                 CASCADE;
DROP TABLE IF EXISTS priorities            CASCADE;
DROP TABLE IF EXISTS emergency_status      CASCADE;
DROP TABLE IF EXISTS emergency_types       CASCADE;
DROP TABLE IF EXISTS roles                 CASCADE;

DROP FUNCTION IF EXISTS generate_emergency_code() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at()          CASCADE;

-- -----------------------------------------------------------------------------
--  2. FUNCIONES Y TRIGGERS
-- -----------------------------------------------------------------------------

-- Mantiene updated_at al dia en cada UPDATE.
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/*
 * Consecutivo por anio para el codigo de la emergencia.
 * Se usa una tabla contador en vez de MAX(code) porque el UPSERT bloquea la
 * fila y evita que dos emergencias simultaneas reciban el mismo codigo.
 */
CREATE TABLE emergency_code_counters (
  year       INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

-- Genera codigos con el formato ERS-2026-000042
CREATE FUNCTION generate_emergency_code() RETURNS TRIGGER AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  next_value   INTEGER;
BEGIN
  IF NEW.code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO emergency_code_counters (year, last_value)
       VALUES (current_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_value = emergency_code_counters.last_value + 1
    RETURNING last_value INTO next_value;

  NEW.code := 'ERS-' || current_year || '-' || LPAD(next_value::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
--  3. CATALOGOS
-- -----------------------------------------------------------------------------

CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(50)  NOT NULL,
  description VARCHAR(200),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'CIUDADANO, PERSONAL, OPERADOR, ADMINISTRADOR';

CREATE TABLE emergency_types (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(30) NOT NULL UNIQUE,
  name        VARCHAR(60) NOT NULL,
  description VARCHAR(200),
  icon        VARCHAR(10),            -- emoji usado en el mapa y las tarjetas
  color       VARCHAR(7),             -- color hexadecimal del marcador
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE emergency_status (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20) NOT NULL UNIQUE,
  name         VARCHAR(40) NOT NULL,
  description  VARCHAR(200),
  color        VARCHAR(7),
  is_final     BOOLEAN     NOT NULL DEFAULT FALSE,  -- RESUELTO y CANCELADO
  sort_order   SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE priorities (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20) NOT NULL UNIQUE,
  name                VARCHAR(40) NOT NULL,
  color               VARCHAR(7),
  level               SMALLINT    NOT NULL,  -- 1 = BAJA ... 4 = CRITICA
  target_minutes      SMALLINT,              -- tiempo objetivo de respuesta
  CONSTRAINT chk_priority_level CHECK (level BETWEEN 1 AND 4)
);

CREATE TABLE zones (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(80)  NOT NULL,
  city       VARCHAR(80)  NOT NULL DEFAULT 'Villavicencio',
  department VARCHAR(80)  NOT NULL DEFAULT 'Meta',
  latitude   NUMERIC(10,7),   -- centro aproximado, para centrar el mapa
  longitude  NUMERIC(10,7),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE
);

-- -----------------------------------------------------------------------------
--  4. ENTIDADES PRINCIPALES
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  role_id         INTEGER      NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  document_type   VARCHAR(10)  NOT NULL DEFAULT 'CC',
  document_number VARCHAR(20)  NOT NULL UNIQUE,
  email           VARCHAR(120) NOT NULL UNIQUE,
  phone           VARCHAR(20),
  password_hash   VARCHAR(255) NOT NULL,
  address         VARCHAR(200),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_users_document_type CHECK (document_type IN ('CC','TI','CE','PA')),
  CONSTRAINT chk_users_email CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/*
 * Tokens de refresco activos. Se guarda el HASH del token, nunca el token en
 * claro: si alguien lee la tabla no puede suplantar una sesion.
 */
CREATE TABLE refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent VARCHAR(200),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE responders (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  responder_type      VARCHAR(20) NOT NULL,
  unit_code           VARCHAR(30) NOT NULL UNIQUE,
  unit_name           VARCHAR(80),
  institution         VARCHAR(100),
  status              VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  current_latitude    NUMERIC(10,7),
  current_longitude   NUMERIC(10,7),
  location_updated_at TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_responder_type CHECK (
    responder_type IN ('PARAMEDICO','BOMBERO','POLICIA','RESCATISTA')
  ),
  CONSTRAINT chk_responder_status CHECK (
    status IN ('DISPONIBLE','OCUPADO','FUERA_DE_SERVICIO')
  ),
  CONSTRAINT chk_responder_lat CHECK (
    current_latitude IS NULL OR current_latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT chk_responder_lng CHECK (
    current_longitude IS NULL OR current_longitude BETWEEN -180 AND 180
  )
);

CREATE TRIGGER trg_responders_updated_at
  BEFORE UPDATE ON responders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE locations (
  id         SERIAL PRIMARY KEY,
  latitude   NUMERIC(10,7) NOT NULL,
  longitude  NUMERIC(10,7) NOT NULL,
  address    VARCHAR(200),
  reference  VARCHAR(200),
  zone_id    INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  city       VARCHAR(80)   NOT NULL DEFAULT 'Villavicencio',
  department VARCHAR(80)   NOT NULL DEFAULT 'Meta',
  accuracy_m NUMERIC(8,2),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_location_lat CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT chk_location_lng CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE emergencies (
  id               SERIAL PRIMARY KEY,
  code             VARCHAR(20)  UNIQUE,
  user_id          INTEGER      NOT NULL REFERENCES users(id)            ON DELETE RESTRICT,
  type_id          INTEGER      NOT NULL REFERENCES emergency_types(id)  ON DELETE RESTRICT,
  status_id        INTEGER      NOT NULL REFERENCES emergency_status(id) ON DELETE RESTRICT,
  priority_id      INTEGER      NOT NULL REFERENCES priorities(id)       ON DELETE RESTRICT,
  location_id      INTEGER      NOT NULL REFERENCES locations(id)        ON DELETE RESTRICT,
  title            VARCHAR(150) NOT NULL,
  description      TEXT,
  is_sos           BOOLEAN      NOT NULL DEFAULT FALSE,
  is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,  -- baja logica
  reported_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  assigned_at      TIMESTAMPTZ,
  in_progress_at   TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  resolution_notes TEXT,
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_emergency_resolved_after_reported CHECK (
    resolved_at IS NULL OR resolved_at >= reported_at
  )
);

CREATE TRIGGER trg_emergencies_code
  BEFORE INSERT ON emergencies
  FOR EACH ROW EXECUTE FUNCTION generate_emergency_code();

CREATE TRIGGER trg_emergencies_updated_at
  BEFORE UPDATE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
--  5. ENTIDADES DEPENDIENTES
-- -----------------------------------------------------------------------------

CREATE TABLE photos (
  id            SERIAL PRIMARY KEY,
  emergency_id  INTEGER      NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  uploaded_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(400) NOT NULL,   -- ruta publica: /uploads/emergencies/...
  mime_type     VARCHAR(60),
  size_bytes    INTEGER,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
  id            SERIAL PRIMARY KEY,
  emergency_id  INTEGER     NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  responder_id  INTEGER     NOT NULL REFERENCES responders(id)  ON DELETE CASCADE,
  assigned_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'ASIGNADO',
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  en_route_at   TIMESTAMPTZ,
  on_site_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_assignment UNIQUE (emergency_id, responder_id),
  CONSTRAINT chk_assignment_status CHECK (
    status IN ('ASIGNADO','EN_CAMINO','EN_SITIO','COMPLETADO','CANCELADO')
  )
);

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/*
 * Bitacora de la emergencia. Tabla SOLO DE INSERCION: nunca se actualiza ni se
 * borra, para que la linea de tiempo sea confiable.
 */
CREATE TABLE emergency_history (
  id           SERIAL PRIMARY KEY,
  emergency_id INTEGER     NOT NULL REFERENCES emergencies(id)      ON DELETE CASCADE,
  user_id      INTEGER     REFERENCES users(id)                     ON DELETE SET NULL,
  status_id    INTEGER     REFERENCES emergency_status(id)          ON DELETE SET NULL,
  action       VARCHAR(40) NOT NULL,
  description  TEXT        NOT NULL,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER      NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  emergency_id INTEGER      REFERENCES emergencies(id)          ON DELETE CASCADE,
  type         VARCHAR(40)  NOT NULL,
  title        VARCHAR(150) NOT NULL,
  message      TEXT         NOT NULL,
  icon         VARCHAR(10),
  is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/*
 * Suscripciones a notificaciones push (Web Push / VAPID).
 *
 * Cada navegador en el que el usuario acepta las notificaciones genera una
 * suscripcion propia, con su endpoint y sus claves de cifrado. Un mismo
 * usuario puede tener varias (telefono, tablet, portatil), por eso la clave
 * unica es el endpoint y no el usuario.
 *
 * Las claves p256dh y auth las genera el NAVEGADOR, no el servidor: sirven
 * para que solo ese dispositivo pueda descifrar el mensaje.
 */
CREATE TABLE push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT         NOT NULL UNIQUE,
  p256dh       VARCHAR(255) NOT NULL,
  auth         VARCHAR(255) NOT NULL,
  user_agent   VARCHAR(200),
  last_used_at TIMESTAMPTZ,
  failure_count SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(40) NOT NULL,
  entity      VARCHAR(40),
  entity_id   INTEGER,
  description TEXT,
  metadata    JSONB,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       TEXT        NOT NULL,
  data_type   VARCHAR(20) NOT NULL DEFAULT 'string',
  description VARCHAR(200),
  updated_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_setting_type CHECK (data_type IN ('string','number','boolean','json'))
);

-- Contactos que se avisan por correo cuando el ciudadano activa el SOS.
CREATE TABLE trusted_contacts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name  VARCHAR(120) NOT NULL,
  email      VARCHAR(150),
  phone      VARCHAR(20),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_trusted_contact_channel CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Chat de una emergencia entre el centro de control y el personal asignado.
CREATE TABLE emergency_messages (
  id           SERIAL PRIMARY KEY,
  emergency_id INTEGER     NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  sender_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  message      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token de un solo uso para "olvide mi contrasena", igual de vida corta que
-- refresh_tokens pero sin rotacion: se usa una vez y se marca gastado.
CREATE TABLE password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
--  6. INDICES
--  Se crean sobre las columnas que aparecen en los WHERE, JOIN y ORDER BY
--  reales del sistema (listados, mapa, dashboard y estadisticas).
-- -----------------------------------------------------------------------------

CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_role     ON users (role_id);
CREATE INDEX idx_users_document ON users (document_number);
CREATE INDEX idx_users_active   ON users (is_active);

CREATE INDEX idx_refresh_user    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_expires ON refresh_tokens (expires_at);

CREATE INDEX idx_trusted_contacts_user      ON trusted_contacts (user_id);
CREATE INDEX idx_emergency_messages_emerg   ON emergency_messages (emergency_id);
CREATE INDEX idx_password_resets_user       ON password_resets (user_id);
CREATE INDEX idx_password_resets_expires    ON password_resets (expires_at);

CREATE INDEX idx_responders_type   ON responders (responder_type);
CREATE INDEX idx_responders_status ON responders (status);
CREATE INDEX idx_responders_user   ON responders (user_id);

CREATE INDEX idx_locations_coords ON locations (latitude, longitude);
CREATE INDEX idx_locations_zone   ON locations (zone_id);

CREATE INDEX idx_emerg_status      ON emergencies (status_id);
CREATE INDEX idx_emerg_type        ON emergencies (type_id);
CREATE INDEX idx_emerg_priority    ON emergencies (priority_id);
CREATE INDEX idx_emerg_user        ON emergencies (user_id);
CREATE INDEX idx_emerg_location    ON emergencies (location_id);
CREATE INDEX idx_emerg_reported_at ON emergencies (reported_at DESC);
-- Indice parcial: solo las SOS, que son pocas y se consultan siempre solas.
CREATE INDEX idx_emerg_sos         ON emergencies (reported_at DESC) WHERE is_sos;
-- Indice parcial: los listados nunca muestran las eliminadas.
CREATE INDEX idx_emerg_active      ON emergencies (reported_at DESC) WHERE NOT is_deleted;

CREATE INDEX idx_photos_emergency  ON photos (emergency_id);

CREATE INDEX idx_assign_emergency  ON assignments (emergency_id);
CREATE INDEX idx_assign_responder  ON assignments (responder_id);
CREATE INDEX idx_assign_status     ON assignments (status);

CREATE INDEX idx_history_emergency ON emergency_history (emergency_id, created_at);

CREATE INDEX idx_notif_user        ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notif_unread      ON notifications (user_id) WHERE NOT is_read;

CREATE INDEX idx_push_user        ON push_subscriptions (user_id);

CREATE INDEX idx_audit_user        ON audit_logs (user_id);
CREATE INDEX idx_audit_action      ON audit_logs (action);
CREATE INDEX idx_audit_created     ON audit_logs (created_at DESC);

-- -----------------------------------------------------------------------------
--  7. VISTAS
--  Concentran los JOIN repetidos para que los modelos no los reescriban.
-- -----------------------------------------------------------------------------

/* Emergencia con todos sus catalogos resueltos. Alimenta listado, mapa y detalle. */
CREATE VIEW v_emergencies_full AS
SELECT
  e.id,
  e.code,
  e.title,
  e.description,
  e.is_sos,
  e.is_deleted,
  e.reported_at,
  e.assigned_at,
  e.in_progress_at,
  e.resolved_at,
  e.closed_at,
  e.resolution_notes,
  e.cancel_reason,
  e.created_at,
  e.updated_at,

  t.id    AS type_id,
  t.code  AS type_code,
  t.name  AS type_name,
  t.icon  AS type_icon,
  t.color AS type_color,

  s.id       AS status_id,
  s.code     AS status_code,
  s.name     AS status_name,
  s.color    AS status_color,
  s.is_final AS status_is_final,

  p.id    AS priority_id,
  p.code  AS priority_code,
  p.name  AS priority_name,
  p.color AS priority_color,
  p.level AS priority_level,

  l.id         AS location_id,
  l.latitude,
  l.longitude,
  l.address,
  l.reference,
  l.city,
  l.department,
  l.accuracy_m,

  z.id   AS zone_id,
  z.name AS zone_name,

  u.id                                  AS reporter_id,
  u.first_name || ' ' || u.last_name    AS reporter_name,
  u.email                               AS reporter_email,
  u.phone                               AS reporter_phone,
  u.document_number                     AS reporter_document,

  (SELECT COUNT(*) FROM photos      ph WHERE ph.emergency_id = e.id) AS photo_count,
  (SELECT COUNT(*) FROM assignments a
     WHERE a.emergency_id = e.id AND a.status <> 'CANCELADO')        AS assignment_count
FROM emergencies e
JOIN emergency_types  t ON t.id = e.type_id
JOIN emergency_status s ON s.id = e.status_id
JOIN priorities       p ON p.id = e.priority_id
JOIN locations        l ON l.id = e.location_id
JOIN users            u ON u.id = e.user_id
LEFT JOIN zones       z ON z.id = l.zone_id;

/* Personal con los datos de su usuario ya unidos. */
CREATE VIEW v_responders_full AS
SELECT
  r.id,
  r.user_id,
  r.responder_type,
  r.unit_code,
  r.unit_name,
  r.institution,
  r.status,
  r.current_latitude,
  r.current_longitude,
  r.location_updated_at,
  r.is_active,
  r.created_at,
  r.updated_at,

  u.first_name,
  u.last_name,
  u.first_name || ' ' || u.last_name AS full_name,
  u.email,
  u.phone,
  u.document_number,
  u.is_active AS user_is_active,

  (SELECT COUNT(*) FROM assignments a
     WHERE a.responder_id = r.id
       AND a.status IN ('ASIGNADO','EN_CAMINO','EN_SITIO')) AS active_assignments
FROM responders r
JOIN users u ON u.id = r.user_id;

/* Contadores del dashboard. Devuelve exactamente una fila. */
CREATE VIEW v_dashboard_counters AS
SELECT
  COUNT(*) FILTER (WHERE s.code = 'PENDIENTE')                      AS pendientes,
  COUNT(*) FILTER (WHERE s.code = 'EN_PROCESO')                     AS en_proceso,
  COUNT(*) FILTER (WHERE s.code = 'RESUELTO')                       AS resueltas,
  COUNT(*) FILTER (WHERE s.code = 'CANCELADO')                      AS canceladas,
  COUNT(*) FILTER (WHERE s.code IN ('PENDIENTE','EN_PROCESO'))      AS activas,
  COUNT(*) FILTER (WHERE e.is_sos AND s.code IN ('PENDIENTE','EN_PROCESO')) AS sos_activas,
  COUNT(*) FILTER (WHERE e.is_sos)                                  AS sos_total,
  COUNT(*) FILTER (WHERE e.reported_at >= CURRENT_DATE)             AS hoy,
  COUNT(*)                                                          AS total,
  (SELECT COUNT(*) FROM responders WHERE status = 'DISPONIBLE'         AND is_active) AS personal_disponible,
  (SELECT COUNT(*) FROM responders WHERE status = 'OCUPADO'            AND is_active) AS personal_ocupado,
  (SELECT COUNT(*) FROM responders WHERE status = 'FUERA_DE_SERVICIO'  AND is_active) AS personal_fuera,
  (SELECT COUNT(*) FROM responders WHERE is_active)                                   AS personal_total
FROM emergencies e
JOIN emergency_status s ON s.id = e.status_id
WHERE NOT e.is_deleted;

/*
 * Tiempo de respuesta por emergencia.
 *   response_minutes  = desde que se reporta hasta que se asigna personal
 *   resolution_minutes = desde que se reporta hasta que se resuelve
 */
CREATE VIEW v_response_time AS
SELECT
  e.id,
  e.code,
  e.reported_at,
  e.assigned_at,
  e.resolved_at,
  t.code AS type_code,
  t.name AS type_name,
  p.code AS priority_code,
  z.id   AS zone_id,
  z.name AS zone_name,
  EXTRACT(EPOCH FROM (e.assigned_at - e.reported_at)) / 60 AS response_minutes,
  EXTRACT(EPOCH FROM (e.resolved_at - e.reported_at)) / 60 AS resolution_minutes
FROM emergencies e
JOIN emergency_types t ON t.id = e.type_id
JOIN priorities      p ON p.id = e.priority_id
JOIN locations       l ON l.id = e.location_id
LEFT JOIN zones      z ON z.id = l.zone_id
WHERE NOT e.is_deleted;
