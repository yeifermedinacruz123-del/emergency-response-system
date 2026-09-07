# 02 — Arquitectura del Sistema
## Emergency Response System (ERS)

> Fase 1 — Diseño arquitectónico.

---

## 1. Estilo arquitectónico

El sistema usa una **arquitectura cliente–servidor en 3 capas**, con el backend
organizado en **capas por responsabilidad** (layered architecture):

```text
Ruta  →  Middleware  →  Controlador  →  Servicio  →  Modelo  →  PostgreSQL
```

| Capa | Responsabilidad | Qué NO hace |
|------|-----------------|-------------|
| **Routes** | Declarar la URL, el verbo HTTP y encadenar middlewares. | No contiene lógica. |
| **Middleware** | Autenticar, autorizar, validar, limitar, subir archivos, auditar. | No consulta la BD de negocio. |
| **Controllers** | Leer `req`, llamar al servicio, responder con `ApiResponse`. | No escribe SQL. |
| **Services** | Reglas de negocio, transacciones, emisión de eventos de socket. | No conoce `req`/`res`. |
| **Models** | SQL puro con el driver `pg` (consultas parametrizadas). | No decide reglas de negocio. |

Esta separación es la que hace que el código sea evaluable y mantenible: cada
archivo tiene una sola razón para cambiar.

---

## 2. Diagrama de componentes

```text
┌──────────────────────────────┐        ┌──────────────────────────────┐
│   PWA MÓVIL (ciudadano y     │        │   PANEL WEB (operador y      │
│   personal de emergencia)    │        │   administrador)             │
│                              │        │                              │
│  HTML5 + CSS3 + JS ES6       │        │  HTML5 + CSS3 + JS ES6       │
│  Geolocation API             │        │  Leaflet + OpenStreetMap     │
│  Camera / File API           │        │  Chart.js                    │
│  Service Worker + Manifest   │        │  Sidebar / Dashboard         │
└──────────┬───────────────────┘        └──────────┬───────────────────┘
           │  fetch (JSON)  +  WebSocket           │
           └───────────────┬───────────────────────┘
                           ▼
        ┌──────────────────────────────────────────────┐
        │              BACKEND — Node.js               │
        │                                              │
        │   Express (API REST)   +   Socket.IO         │
        │   ────────────────────────────────────────   │
        │   helmet · cors · rate-limit · validators    │
        │   JWT · bcrypt · multer · morgan             │
        │   ────────────────────────────────────────   │
        │   routes → controllers → services → models   │
        │   ────────────────────────────────────────   │
        │   static: sirve /frontend en el mismo origen │
        └──────────────────┬───────────────────────────┘
                           │  pool de conexiones (pg)
                           ▼
        ┌──────────────────────────────────────────────┐
        │            PostgreSQL 16 (Docker)            │
        │  13 tablas · vistas · índices · triggers     │
        └──────────────────────────────────────────────┘

        ┌──────────────────────────────────────────────┐
        │  Almacenamiento de fotos                     │
        │  desarrollo: backend/uploads/ (disco local)  │
        │  producción: capa abstraída → S3/Cloudinary  │
        └──────────────────────────────────────────────┘
```

---

## 3. Decisión clave: un solo origen

El backend sirve la carpeta `frontend/` como contenido estático:

```js
app.use(express.static(path.join(__dirname, '../../frontend')));
```

**Por qué:**

1. La **Geolocation API** y el **Service Worker** exigen un origen seguro
   (`https://` o `localhost`). Sirviendo todo desde `http://localhost:4000`
   ambos funcionan sin configuración extra.
2. El **Service Worker** solo puede controlar páginas de su propio origen.
3. Elimina los problemas de CORS y de cookies entre puertos distintos.
4. El despliegue es un solo proceso.

Aun así se deja **CORS configurado** por variable de entorno, para poder abrir el
frontend con Live Server (`http://127.0.0.1:5500`) durante el desarrollo.

---

## 4. Estructura de carpetas

```text
proyecto final/
│
├── backend/
│   ├── src/
│   │   ├── config/          env.js · database.js · constants.js · logger.js
│   │   ├── database/        index.js (query · transaction · healthcheck)
│   │   ├── models/          SQL puro, uno por entidad
│   │   ├── services/        reglas de negocio y transacciones
│   │   ├── controllers/     traducen HTTP ↔ servicios
│   │   ├── routes/          index.js + una ruta por recurso
│   │   ├── middleware/      auth · validate · error · upload · audit · rateLimit
│   │   ├── validators/      esquemas de validación por recurso
│   │   ├── sockets/         index.js · events.js · handlers por dominio
│   │   ├── utils/           ApiError · ApiResponse · asyncHandler · jwt · geo
│   │   ├── app.js           construcción de la app Express
│   │   └── server.js        arranque HTTP + Socket.IO
│   ├── uploads/             fotos de las emergencias (desarrollo)
│   ├── logs/
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── index.html           portada / redirección por rol
│   ├── login.html · register.html
│   ├── pages/               dashboard · emergencies · emergency-detail · map ·
│   │                        users · responders · statistics · notifications ·
│   │                        audit · settings
│   ├── app/                 PWA del ciudadano y del personal (móvil)
│   ├── css/                 reset · variables · global · layout · components ·
│   │                        forms · tables · dashboard · maps · mobile · responsive
│   ├── js/
│   │   ├── core/            config · api · auth · socket · utils · ui · store
│   │   ├── components/      sidebar · navbar · modal · toast · table · badge
│   │   ├── pages/           un módulo por página del panel
│   │   └── mobile/          un módulo por pantalla de la PWA
│   ├── assets/              images/ · icons/
│   ├── vendor/              librerías locales opcionales (offline)
│   ├── manifest.json
│   └── service-worker.js
│
├── database/
│   ├── schema.sql           DDL completo
│   ├── seed.sql             datos de demostración (Villavicencio)
│   ├── migrations/
│   ├── seeds/
│   └── init/                se monta en el contenedor de PostgreSQL
│
├── documentation/
│   ├── 01-ANALISIS-REQUISITOS.md
│   ├── 02-ARQUITECTURA.md
│   ├── 03-MODELO-DATOS.md
│   ├── 04-PLAN-DE-FASES.md
│   ├── 05-API-REST.md
│   └── diagramas/
│
├── .env.example
├── .gitignore
├── package.json             scripts raíz (orquestación)
├── docker-compose.yml
└── README.md
```

---

## 5. Flujo de una petición (ejemplo real)

`POST /api/emergencies` con una emergencia SOS:

```text
1. rateLimit.middleware      → ¿supera el límite de peticiones?
2. auth.middleware           → verifica el JWT, carga req.user
3. authorize('CIUDADANO')    → ¿el rol puede crear emergencias?
4. upload.middleware         → guarda las fotos en backend/uploads/
5. validate(createEmergency) → valida tipo, lat/lng, descripción
6. emergency.controller      → lee req.body y llama al servicio
7. emergency.service         → BEGIN
                               · inserta en locations
                               · inserta en emergencies (SOS ⇒ prioridad CRÍTICA)
                               · inserta en photos
                               · inserta en emergency_history ("Emergencia creada")
                               · inserta en notifications para los operadores
                               COMMIT
8. socket.emit               → 'emergency:new' + 'sos:activated' a la sala operators
9. ApiResponse.created       → 201 { success: true, data: { ... } }
```

Si algo falla, el servicio lanza un `ApiError`, la transacción hace `ROLLBACK` y el
`error.middleware` devuelve una respuesta JSON uniforme.

---

## 6. Contrato uniforme de la API

**Respuesta correcta**

```json
{
  "success": true,
  "message": "Emergencia creada correctamente",
  "data": { "id": 42, "code": "ERS-2026-000042" },
  "meta": { "page": 1, "limit": 20, "total": 137 }
}
```

**Respuesta con error**

```json
{
  "success": false,
  "message": "Los datos enviados no son válidos",
  "errors": [{ "field": "latitude", "message": "La latitud es obligatoria" }],
  "code": "VALIDATION_ERROR"
}
```

Códigos usados: `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`,
`403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`,
`429 Too Many Requests`, `500 Internal Server Error`.

---

## 7. Seguridad

| Control | Implementación |
|---------|----------------|
| Cifrado de contraseñas | `bcryptjs` con 12 rondas de sal. |
| Autenticación | JWT de acceso (15 min) + token de refresco (7 días, hash en BD). |
| Autorización | `authorize(...roles)` sobre `req.user.role`. |
| Inyección SQL | Consultas **siempre** parametrizadas (`$1, $2, ...`). Nunca concatenación. |
| Cabeceras HTTP | `helmet` con CSP ajustada para Leaflet y Chart.js. |
| CORS | Lista blanca por `CORS_ORIGIN`. |
| Fuerza bruta | `express-rate-limit`: 100 req/15 min global, 5 intentos/15 min en login. |
| Validación | `express-validator` en cada endpoint que recibe datos. |
| Subida de archivos | `multer`: solo imágenes, máx. 5 MB, máx. 5 por emergencia, nombre aleatorio. |
| Secretos | Solo en `.env`; el repositorio incluye `.env.example` sin valores reales. |
| Auditoría | `audit_logs` guarda actor, acción, entidad, IP y valores anteriores/nuevos. |

---

## 8. Tiempo real — Socket.IO

### Salas

| Sala | Miembros | Uso |
|------|----------|-----|
| `control-room` | operadores y administradores | Todos los eventos del centro de control. |
| `user:{id}` | un usuario concreto | Notificaciones personales. |
| `emergency:{id}` | quienes ven ese detalle | Actualizaciones de una emergencia. |
| `responders` | personal en servicio | Despachos y asignaciones. |

### Eventos

| Evento | Emisor | Receptores | Carga útil |
|--------|--------|------------|------------|
| `emergency:new` | servidor | `control-room` | emergencia completa |
| `emergency:update` | servidor | `control-room`, `emergency:{id}` | emergencia completa |
| `emergency:assigned` | servidor | `control-room`, `responders`, `user:{id}` | emergencia + responsables |
| `emergency:status` | servidor | `control-room`, `emergency:{id}`, `user:{id}` | id, estado anterior, nuevo |
| `emergency:resolved` | servidor | `control-room`, `user:{id}` | emergencia + tiempo de respuesta |
| `sos:activated` | servidor | `control-room` | emergencia crítica (alerta sonora) |
| `responder:location:update` | cliente/servidor | `control-room` | id, lat, lng, timestamp |
| `notification:new` | servidor | `user:{id}` | notificación |

El handshake del socket verifica el mismo JWT que la API: sin token válido no hay
conexión.

---

## 9. Estrategia de la PWA

| Recurso | Estrategia de caché |
|---------|---------------------|
| HTML, CSS, JS, iconos | *Cache First* con actualización en segundo plano. |
| Teselas de OpenStreetMap | *Network First* con caché limitada. |
| Llamadas a `/api/` | *Network Only* (los datos de emergencias nunca se sirven obsoletos). |
| Fallo total de red | Página `offline.html`. |

El `manifest.json` declara `display: standalone`, color de tema institucional y los
iconos 192/512 px necesarios para instalar en Android.

---

## 10. Stack y versiones

| Componente | Tecnología | Versión objetivo |
|------------|------------|------------------|
| Runtime | Node.js | ≥ 18 (probado en 22) |
| Framework HTTP | Express | 4.x |
| Base de datos | PostgreSQL | 16 |
| Driver BD | `pg` (SQL puro, sin ORM) | 8.x |
| Tiempo real | Socket.IO | 4.x |
| Autenticación | jsonwebtoken + bcryptjs | 9.x / 2.x |
| Subida de archivos | multer | 1.x |
| Frontend | HTML5 + CSS3 + JavaScript ES6+ | — sin framework |
| Mapas | Leaflet + OpenStreetMap | 1.9.x |
| Gráficos | Chart.js | 4.x |
| Contenedores | Docker Compose | v2 |

> **Nota sobre bcrypt:** se usa `bcryptjs` (implementación en JavaScript puro,
> API idéntica) para evitar la compilación nativa que suele fallar en Windows.
