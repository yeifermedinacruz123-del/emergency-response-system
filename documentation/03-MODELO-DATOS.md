# 03 — Modelo de Datos
## Emergency Response System (ERS) — PostgreSQL 16

> Fase 1 — Entidades, relaciones y reglas de integridad.
> El DDL se implementa en la Fase 3 (`database/schema.sql`).

---

## 1. Entidades

**Catálogos (datos de referencia, poco cambiantes)**

| Tabla | Descripción |
|-------|-------------|
| `roles` | CIUDADANO, PERSONAL, OPERADOR, ADMINISTRADOR. |
| `emergency_types` | Médica, tránsito, incendio, seguridad, inundación, desastre natural, otra. |
| `emergency_status` | PENDIENTE, EN_PROCESO, RESUELTO, CANCELADO. |
| `priorities` | BAJA, MEDIA, ALTA, CRITICA. |
| `zones` | Zonas/comunas de Villavicencio, para la estadística geográfica. |

**Entidades principales**

| Tabla | Descripción |
|-------|-------------|
| `users` | Todas las personas del sistema, con su rol. |
| `responders` | Perfil operativo del personal de emergencia (extiende a `users`). |
| `locations` | Punto geográfico reutilizable (lat, lng, dirección, zona). |
| `emergencies` | Núcleo del sistema: el incidente reportado. |

**Entidades dependientes**

| Tabla | Descripción |
|-------|-------------|
| `photos` | Fotografías adjuntas a una emergencia. |
| `assignments` | Relación N:M entre emergencias y responsables, con sus marcas de tiempo. |
| `emergency_history` | Bitácora inmutable de todo lo que le pasa a una emergencia. |
| `notifications` | Bandeja de notificaciones por usuario. |
| `audit_logs` | Auditoría técnica de las acciones sensibles. |
| `refresh_tokens` | Tokens de refresco activos (hash), para poder revocarlos. |
| `system_settings` | Configuración editable del sistema (clave/valor). |

---

## 2. Diagrama entidad–relación

```text
                      ┌───────────┐
                      │   roles   │
                      └─────┬─────┘
                            │ 1
                            │
                            │ N
                      ┌─────▼─────┐            ┌──────────────┐
        ┌─────────────┤   users   ├────────────► refresh_tokens│
        │             └─────┬─────┘  1      N  └──────────────┘
        │                   │ 1
        │ 1 (reporta)       │
        │                   │ 0..1
        │             ┌─────▼──────┐
        │             │ responders │
        │             └─────┬──────┘
        │                   │ 1
        │                   │
        │                   │ N
        │ N          ┌──────▼───────┐
  ┌─────▼────────┐   │ assignments  │
  │ emergencies  ├───┤              │
  │              │ 1 └──────────────┘ N
  │              │
  │              │ 1      N  ┌──────────────────┐
  │              ├──────────►│      photos      │
  │              │           └──────────────────┘
  │              │ 1      N  ┌──────────────────┐
  │              ├──────────►│ emergency_history│
  │              │           └──────────────────┘
  │              │ 1      N  ┌──────────────────┐
  │              ├──────────►│  notifications   │
  └───┬───┬───┬──┘           └──────────────────┘
      │   │   │
      │   │   │ N ┌──────────────────┐
      │   │   └──►│  emergency_types │
      │   │       └──────────────────┘
      │   │     N ┌──────────────────┐
      │   └──────►│ emergency_status │
      │           └──────────────────┘
      │         N ┌──────────────────┐
      ├──────────►│    priorities    │
      │           └──────────────────┘
      │         1 ┌──────────────────┐      N ┌────────┐
      └──────────►│    locations     ├───────►│ zones  │
                  └──────────────────┘  N   1 └────────┘

  ┌────────────┐        ┌──────────────────┐
  │ audit_logs │◄───────┤      users       │   (actor de la acción)
  └────────────┘   N  1 └──────────────────┘

  ┌──────────────────┐
  │ system_settings  │   (independiente)
  └──────────────────┘
```

---

## 3. Cardinalidades

| Relación | Cardinalidad | Regla |
|----------|--------------|-------|
| `roles` → `users` | 1 : N | Un usuario tiene exactamente un rol. |
| `users` → `responders` | 1 : 0..1 | Solo los usuarios con rol PERSONAL tienen ficha de responder. |
| `users` → `emergencies` | 1 : N | Un ciudadano puede reportar muchas emergencias. |
| `emergency_types` → `emergencies` | 1 : N | Cada emergencia tiene un tipo. |
| `emergency_status` → `emergencies` | 1 : N | Cada emergencia tiene un estado actual. |
| `priorities` → `emergencies` | 1 : N | Cada emergencia tiene una prioridad. |
| `locations` → `emergencies` | 1 : 1 | Cada emergencia tiene su punto geográfico. |
| `zones` → `locations` | 1 : N | Una ubicación pertenece a una zona (puede ser NULL). |
| `emergencies` ↔ `responders` | N : M vía `assignments` | Varias unidades pueden atender un mismo incidente. |
| `emergencies` → `photos` | 1 : N | Hasta 5 fotografías por emergencia. |
| `emergencies` → `emergency_history` | 1 : N | Bitácora completa. |
| `users` → `notifications` | 1 : N | Bandeja personal. |
| `users` → `audit_logs` | 1 : N | Quién hizo qué. |

---

## 4. Detalle de las tablas principales

### 4.1 `users`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `role_id` | INT | FK → `roles(id)`, NOT NULL, ON DELETE RESTRICT |
| `first_name` | VARCHAR(80) | NOT NULL |
| `last_name` | VARCHAR(80) | NOT NULL |
| `document_type` | VARCHAR(10) | CHECK IN ('CC','TI','CE','PA') |
| `document_number` | VARCHAR(20) | UNIQUE, NOT NULL |
| `email` | VARCHAR(120) | UNIQUE, NOT NULL, CHECK formato correo |
| `phone` | VARCHAR(20) | |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `address` | VARCHAR(200) | |
| `is_active` | BOOLEAN | DEFAULT TRUE |
| `last_login_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

Índices: `idx_users_email`, `idx_users_role`, `idx_users_document`.

### 4.2 `emergencies`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `code` | VARCHAR(20) | UNIQUE — formato `ERS-2026-000042` |
| `user_id` | INT | FK → `users(id)`, NOT NULL |
| `type_id` | INT | FK → `emergency_types(id)`, NOT NULL |
| `status_id` | INT | FK → `emergency_status(id)`, NOT NULL |
| `priority_id` | INT | FK → `priorities(id)`, NOT NULL |
| `location_id` | INT | FK → `locations(id)`, NOT NULL |
| `title` | VARCHAR(150) | NOT NULL |
| `description` | TEXT | |
| `is_sos` | BOOLEAN | DEFAULT FALSE |
| `reported_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `assigned_at` | TIMESTAMPTZ | |
| `in_progress_at` | TIMESTAMPTZ | |
| `resolved_at` | TIMESTAMPTZ | |
| `closed_at` | TIMESTAMPTZ | |
| `resolution_notes` | TEXT | |
| `cancel_reason` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

Índices: `idx_emerg_status`, `idx_emerg_type`, `idx_emerg_priority`,
`idx_emerg_user`, `idx_emerg_reported_at`, `idx_emerg_sos` (parcial `WHERE is_sos`).

Restricción: `CHECK (resolved_at IS NULL OR resolved_at >= reported_at)`.

### 4.3 `responders`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `user_id` | INT | FK → `users(id)`, UNIQUE, NOT NULL |
| `responder_type` | VARCHAR(20) | CHECK IN ('PARAMEDICO','BOMBERO','POLICIA','RESCATISTA') |
| `unit_code` | VARCHAR(30) | UNIQUE — ej. `UM-03`, `MB-01` |
| `unit_name` | VARCHAR(80) | ej. "Unidad Médica 03" |
| `institution` | VARCHAR(100) | ej. "Bomberos Villavicencio" |
| `status` | VARCHAR(20) | CHECK IN ('DISPONIBLE','OCUPADO','FUERA_DE_SERVICIO') |
| `current_latitude` | NUMERIC(10,7) | |
| `current_longitude` | NUMERIC(10,7) | |
| `location_updated_at` | TIMESTAMPTZ | |
| `is_active` | BOOLEAN | DEFAULT TRUE |

### 4.4 `locations`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `latitude` | NUMERIC(10,7) | NOT NULL, CHECK BETWEEN -90 AND 90 |
| `longitude` | NUMERIC(10,7) | NOT NULL, CHECK BETWEEN -180 AND 180 |
| `address` | VARCHAR(200) | |
| `reference` | VARCHAR(200) | punto de referencia escrito por el ciudadano |
| `zone_id` | INT | FK → `zones(id)` NULL |
| `city` | VARCHAR(80) | DEFAULT 'Villavicencio' |
| `department` | VARCHAR(80) | DEFAULT 'Meta' |
| `accuracy_m` | NUMERIC(8,2) | precisión reportada por el GPS |

Índice compuesto `idx_locations_coords (latitude, longitude)` para las consultas
de cercanía.

### 4.5 `assignments`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `emergency_id` | INT | FK → `emergencies(id)` ON DELETE CASCADE |
| `responder_id` | INT | FK → `responders(id)` |
| `assigned_by` | INT | FK → `users(id)` |
| `status` | VARCHAR(20) | CHECK IN ('ASIGNADO','EN_CAMINO','EN_SITIO','COMPLETADO','CANCELADO') |
| `assigned_at` / `accepted_at` / `en_route_at` / `on_site_at` / `completed_at` | TIMESTAMPTZ | |
| `notes` | TEXT | |

Restricción `UNIQUE (emergency_id, responder_id)`: no se asigna dos veces la misma
unidad al mismo incidente.

### 4.6 `emergency_history`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | SERIAL | PK |
| `emergency_id` | INT | FK → `emergencies(id)` ON DELETE CASCADE |
| `user_id` | INT | FK → `users(id)` NULL (NULL = acción automática) |
| `status_id` | INT | FK → `emergency_status(id)` NULL |
| `action` | VARCHAR(40) | CREADA, ASIGNADA, ESTADO_CAMBIADO, PRIORIDAD_CAMBIADA, COMENTARIO, RESUELTA, CANCELADA |
| `description` | TEXT | NOT NULL — texto legible que se muestra en la línea de tiempo |
| `metadata` | JSONB | valores anteriores/nuevos |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

Esta tabla es **solo de inserción**: nunca se actualiza ni se borra.

---

## 5. Normalización

El modelo cumple la **Tercera Forma Normal (3FN)**:

- **1FN** — todos los atributos son atómicos; las fotos y las asignaciones, que
  serían campos repetidos, viven en tablas propias.
- **2FN** — no hay claves compuestas con dependencias parciales; `assignments`
  usa un `id` propio y sus atributos dependen de la asignación completa.
- **3FN** — no hay dependencias transitivas: el nombre y el color de un estado
  están en `emergency_status`, no repetidos en `emergencies`; la zona está en
  `locations`, no duplicada en `emergencies`.

**Desnormalización controlada** (justificada por rendimiento):
`emergencies` guarda `assigned_at`, `in_progress_at` y `resolved_at` aunque esa
información también esté en el historial. Esto evita un `JOIN` con agregación en
cada consulta del dashboard y en el cálculo del tiempo promedio de respuesta.

---

## 6. Vistas planificadas

| Vista | Uso |
|-------|-----|
| `v_emergencies_full` | Emergencia + tipo + estado + prioridad + ubicación + zona + ciudadano. Alimenta listado, mapa y detalle. |
| `v_responders_full` | Responder + datos del usuario + estado + posición actual. |
| `v_dashboard_counters` | Conteos por estado, SOS y emergencias del día. |
| `v_response_time` | Tiempo de respuesta por emergencia resuelta (minutos). |

---

## 7. Triggers planificados

| Trigger | Tabla | Acción |
|---------|-------|--------|
| `trg_set_updated_at` | `users`, `emergencies`, `responders`, `assignments` | Actualiza `updated_at` en cada UPDATE. |
| `trg_emergency_code` | `emergencies` | Genera `ERS-{año}-{consecutivo}` antes de insertar. |

El resto de la lógica (historial, notificaciones, cambio de estado del personal)
se implementa en la **capa de servicios** dentro de una transacción, para que sea
visible, testeable y evaluable en el código.

---

## 8. Datos de demostración (Villavicencio)

| Conjunto | Cantidad aproximada |
|----------|--------------------|
| Roles | 4 |
| Tipos de emergencia | 7 |
| Estados | 4 |
| Prioridades | 4 |
| Zonas | 10 |
| Usuarios | 12 (1 admin, 2 operadores, 3 ciudadanos, 6 personal) |
| Responders | 6 (2 paramédicos, 2 bomberos, 1 policía, 1 rescatista) |
| Emergencias | ~25 repartidas en los últimos 30 días y en todos los estados |
| Fotos, asignaciones, historial, notificaciones | derivados de las emergencias |

Volumen suficiente para que el dashboard, los gráficos por día/tipo/zona, el mapa
y el tiempo promedio de respuesta muestren información realista.
