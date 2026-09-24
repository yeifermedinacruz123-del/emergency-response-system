# 05 — Diseño de la API REST

> Fase 1 — Contrato planificado. Se implementa en las fases 4, 5 y 6.
> Prefijo base: `/api` · Autenticación: `Authorization: Bearer <token>`

---

## Convenciones

- Todas las respuestas son JSON con la forma `{ success, message, data, meta }`.
- Los listados aceptan `?page=1&limit=20&search=&sort=&order=asc|desc`.
- Las fechas viajan en ISO-8601 UTC.
- `🔓` público · `🔒` requiere sesión · junto al rol permitido.

---

## Autenticación — `/api/auth`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/register` | 🔓 | Registro de ciudadano. |
| POST | `/login` | 🔓 | Devuelve `accessToken`, `refreshToken` y el usuario. |
| POST | `/refresh` | 🔓 | Renueva el token de acceso. |
| POST | `/logout` | 🔒 todos | Revoca el token de refresco. |
| GET | `/profile` | 🔒 todos | Perfil del usuario autenticado. |
| PUT | `/profile` | 🔒 todos | Actualiza datos propios. |
| PATCH | `/password` | 🔒 todos | Cambia la contraseña. |

## Emergencias — `/api/emergencies`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/` | 🔒 operador, admin | Listado con filtros: `status`, `type`, `priority`, `zone`, `sos`, `from`, `to`. |
| GET | `/mine` | 🔒 ciudadano | Emergencias del usuario autenticado. |
| GET | `/assigned` | 🔒 personal | Emergencias asignadas al responder autenticado. |
| GET | `/map` | 🔒 operador, admin | Puntos activos optimizados para el mapa. |
| GET | `/:id` | 🔒 según rol | Detalle completo: usuario, ubicación, fotos, historial, asignaciones. |
| POST | `/` | 🔒 ciudadano, operador, admin | Crea una emergencia (`multipart/form-data` con fotos). |
| POST | `/sos` | 🔒 ciudadano | Crea una emergencia SOS con la prioridad de Configuración (CRÍTICA por defecto). Tiene su propio límite por persona y no cuenta para el límite general. |
| PUT | `/:id` | 🔒 operador, admin | Actualiza título, descripción y ubicación. |
| PATCH | `/:id/status` | 🔒 personal, operador, admin | Cambia el estado y escribe el historial. |
| PATCH | `/:id/priority` | 🔒 operador, admin | Cambia la prioridad. |
| POST | `/:id/assign` | 🔒 operador, admin | Asigna uno o varios responsables. |
| DELETE | `/:id/assign/:assignmentId` | 🔒 operador, admin | Retira una asignación. |
| POST | `/:id/comments` | 🔒 personal, operador, admin | Registra un avance en el historial. |
| POST | `/:id/photos` | 🔒 ciudadano, personal | Añade fotografías (hasta el máximo de Configuración). |
| GET | `/:id/messages` · POST | 🔒 personal, operador, admin | Chat entre el centro de control y el personal asignado. |

Las rutas de las fotos y notas de voz (`photos[].file_path`) salen **firmadas**:
`/uploads/emergencies/<archivo>?exp=<unix>&sig=<firma>`. Solo las recibe quien
puede ver la emergencia y caducan en unas horas; sin firma, o con la firma
alterada o vencida, `/uploads` responde **403**. El archivo se guarda en
PostgreSQL (`STORAGE_PROVIDER=database`, por defecto) o en disco (`local`).
| GET | `/:id/history` | 🔒 según rol | Línea de tiempo de la emergencia. |
| DELETE | `/:id` | 🔒 admin | Elimina (baja lógica). |

## Usuarios — `/api/users`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/` | 🔒 admin |
| GET | `/:id` | 🔒 admin |
| POST | `/` | 🔒 admin |
| PUT | `/:id` | 🔒 admin |
| PATCH | `/:id/status` | 🔒 admin — activar/desactivar |
| PATCH | `/:id/role` | 🔒 admin |
| DELETE | `/:id` | 🔒 admin |

## Personal — `/api/responders`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/` | 🔒 operador, admin | Listado con filtro por tipo y estado. |
| GET | `/available` | 🔒 operador, admin | Solo DISPONIBLE; admite `?lat=&lng=` para ordenar por cercanía. |
| GET | `/:id` | 🔒 operador, admin | Detalle. |
| POST | `/` | 🔒 admin | Crea la ficha de personal. |
| PUT | `/:id` | 🔒 admin | Actualiza la ficha. |
| PATCH | `/:id/status` | 🔒 personal (propio), operador, admin | Cambia disponibilidad. |
| PATCH | `/me/location` | 🔒 personal | Actualiza su posición GPS. |

## Catálogos — `/api/catalogs`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/types` · `/statuses` · `/priorities` · `/roles` · `/zones` | 🔒 todos |

## Estadísticas — `/api/statistics`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboard` | Tarjetas del dashboard. |
| GET | `/emergencies/by-day?days=30` | Serie temporal. |
| GET | `/emergencies/by-type` | Distribución por tipo. |
| GET | `/emergencies/by-status` | Distribución por estado. |
| GET | `/emergencies/by-priority` | Distribución por prioridad. |
| GET | `/emergencies/by-zone` | Distribución por zona. |
| GET | `/response-time` | Tiempo promedio de respuesta y su evolución. |

## Notificaciones — `/api/notifications`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Bandeja del usuario autenticado. |
| GET | `/unread-count` | Contador para el badge. |
| PATCH | `/:id/read` | Marca una como leída. |
| PATCH | `/read-all` | Marca todas como leídas. |
| GET | `/push-key` | Clave pública VAPID (o `enabled: false` si el push está apagado). |
| POST · DELETE | `/subscribe` | Registra o da de baja este navegador. Solo se aceptan endpoints HTTPS de servicios push reales (Google, Mozilla, Microsoft, Apple); la baja solo afecta a suscripciones propias. |
| POST | `/test` | Envía un push de prueba a los dispositivos del usuario. |

## Auditoría — `/api/audit`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/` | 🔒 admin — filtros por usuario, acción, entidad y rango de fechas |

## Configuración — `/api/settings`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/` | 🔒 admin |
| PUT | `/` | 🔒 admin — recibe `{ clave: valor }`; valida tipo y rango de cada opción y rechaza el lote entero con 422 si alguna no es válida |

Las opciones se aplican de inmediato: centro y zoom del mapa, ciudad, prioridad
del SOS, máximo de fotos (sin pasar `MAX_FILES_PER_EMERGENCY`) y el envío push.

## Salud del sistema

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/api/health` | 🔓 | Estado del servidor y de la conexión a PostgreSQL. No cuenta para el límite de peticiones. |
| GET | `/api/config` | 🔓 | Parámetros públicos: mapa, límites de subida y si el push está activo. |
