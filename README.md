<div align="center">

# 🚨 EMERGENCY RESPONSE SYSTEM

### Sistema Inteligente de Gestión y Atención de Emergencias

Plataforma **web + móvil (PWA)** para el reporte, despacho y seguimiento de
emergencias en tiempo real.

`HTML5` · `CSS3` · `JavaScript ES6+` · `Node.js` · `Express` · `PostgreSQL` · `Socket.IO` · `Leaflet` · `Chart.js`

**Proyecto final — Web y Sistemas Móviles — 2026-2**

</div>

---

## 📌 Descripción

El Emergency Response System (ERS) conecta a los ciudadanos con un centro de
control de emergencias. El ciudadano reporta un incidente desde su teléfono —con
ubicación GPS y fotografías— o activa un **botón SOS**; el reporte aparece de
inmediato en el panel del operador, que lo ve en un mapa, le asigna personal y
sigue su estado hasta cerrarlo. Cada cambio queda registrado en un historial que
el ciudadano también puede consultar.

## 🎯 Objetivo

Construir una plataforma real, funcional y presentable que resuelva tres
problemas de la atención de emergencias: la **pérdida de la ubicación exacta**,
la **falta de trazabilidad** para el ciudadano y el **despacho a ciegas** del
operador.

---

## ✨ Características

| Módulo | Qué hace |
|--------|----------|
| 🚨 **Reporte de emergencias** | 7 tipos, descripción, prioridad, GPS y hasta 5 fotografías. |
| 🆘 **Botón SOS** | Un toque → ubicación automática + emergencia de prioridad **CRÍTICA**. |
| 📍 **Geolocalización** | Geolocation API + Leaflet + OpenStreetMap (sin servicios de pago). |
| 🗺️ **Mapa del centro de control** | Emergencias y unidades en vivo, con marcadores por tipo, prioridad y estado. |
| ⚡ **Tiempo real** | Socket.IO: el dashboard se actualiza sin recargar la página. |
| 👨‍🚒 **Asignación de personal** | Paramédicos, bomberos, policía y rescatistas con disponibilidad y posición. |
| 🔄 **Estados e historial** | PENDIENTE → EN PROCESO → RESUELTO / CANCELADO, con bitácora completa. |
| 📊 **Estadísticas** | Chart.js sobre datos reales: por día, tipo, estado, prioridad, zona y tiempo de respuesta. |
| 👥 **4 roles** | Ciudadano, personal de emergencia, operador y administrador. |
| 🔔 **Notificaciones** | Tres canales: bandeja persistente, Socket.IO en vivo y Web Push con claves propias. |
| 📱 **PWA** | Instalable en Android desde el navegador, con service worker. |
| 🔐 **Seguridad** | JWT, bcrypt, Helmet, CORS, rate limiting, validación y auditoría. |

---

## 🧱 Tecnologías

### Frontend — **sin frameworks**

| Tecnología | Uso |
|------------|-----|
| HTML5 semántico | Estructura de todas las páginas. |
| CSS3 | Variables, Grid, Flexbox, media queries y animaciones. |
| JavaScript ES6+ (módulos nativos) | Toda la lógica, organizada en módulos. |
| Fetch API | Consumo de la API REST. |
| Socket.IO Client | Actualización en tiempo real. |
| Leaflet + OpenStreetMap | Mapas y marcadores. |
| Chart.js | Gráficos estadísticos. |
| Service Worker + Manifest | Instalación como PWA. |

> El frontend se edita directamente en VS Code: `.html` para la estructura,
> `.css` para el diseño y `.js` para la lógica. No hay build ni transpilación.

### Backend

| Tecnología | Uso |
|------------|-----|
| Node.js ≥ 18 | Entorno de ejecución. |
| Express 4 | API REST. |
| PostgreSQL 16 + driver `pg` | Base de datos con **SQL puro** (sin ORM). |
| Socket.IO 4 | Comunicación en tiempo real. |
| jsonwebtoken + bcryptjs | Autenticación y cifrado de contraseñas. |
| helmet · cors · express-rate-limit · express-validator · multer | Seguridad y utilidades. |

---

## 🏗️ Arquitectura

```text
Navegador / PWA  ──fetch + WebSocket──►  Express + Socket.IO  ──pg──►  PostgreSQL
                                              │
                            routes → controllers → services → models
```

El backend sirve además la carpeta `frontend/` como contenido estático, de modo
que todo corre en **un solo origen** (`http://localhost:4000`). Esto es lo que
permite que la Geolocation API y el Service Worker funcionen en desarrollo sin
certificados HTTPS.

📄 Detalle completo en [`documentation/02-ARQUITECTURA.md`](documentation/02-ARQUITECTURA.md).

---

## 📁 Estructura del proyecto

```text
proyecto final/
├── backend/                      66 módulos JavaScript
│   ├── src/
│   │   ├── config/               env · database · constants · logger
│   │   ├── database/             query · transaction · healthcheck
│   │   ├── models/               SQL puro, uno por entidad (13)
│   │   ├── services/             reglas de negocio (7)
│   │   ├── controllers/          HTTP ↔ servicios (10)
│   │   ├── routes/               definición de endpoints (11)
│   │   ├── middleware/           auth · validate · error · upload · rateLimit
│   │   ├── validators/           reglas de entrada (5)
│   │   ├── sockets/              index (servidor) · realtime (emisor)
│   │   ├── utils/                ApiError · ApiResponse · jwt · pagination
│   │   ├── app.js                middlewares y montaje de rutas
│   │   └── server.js             arranque, Socket.IO y apagado ordenado
│   ├── scripts/
│   │   ├── db-local.js           PostgreSQL sin instalador (initdb + pg_ctl)
│   │   └── run-sql.js            ejecuta .sql sin necesitar psql
│   ├── tests/                    182 comprobaciones
│   │   ├── api.test.js           92 · API REST
│   │   ├── realtime.test.js      49 · Socket.IO
│   │   └── security.test.js      41 · seguridad
│   ├── uploads/emergencies/      fotografías (desarrollo)
│   └── Dockerfile
│
├── frontend/                     19 HTML · 12 CSS · 30 JS
│   ├── index.html                estado del sistema y avance
│   ├── login.html                acceso
│   ├── manifest.json             metadatos de instalación de la PWA
│   ├── service-worker.js         caché, modo sin conexión y push
│   ├── css/                      reset · variables · componentes · layout ·
│   │                             formularios · tablas · dashboard · mapas ·
│   │                             gráficos · móvil
│   ├── js/
│   │   ├── core/                 config · api · auth · socket · push · geo · ui · utils
│   │   ├── components/           layout (armazón) · map (capa Leaflet)
│   │   ├── pages/                un módulo por pantalla del panel (13)
│   │   └── mobile/               un módulo por pantalla de la PWA (6)
│   ├── pages/                    panel: dashboard · emergencias · detalle ·
│   │                             mapa · personal · usuarios · estadísticas ·
│   │                             notificaciones · auditoría · configuración
│   ├── app/                      PWA: inicio · reportar · mis reportes ·
│   │                             seguimiento · avisos · sin conexión
│   ├── vendor/                   Leaflet y Chart.js alojados localmente
│   └── assets/icons/             iconos de la PWA
│
├── database/
│   ├── schema.sql                17 tablas · 4 vistas · 2 disparadores
│   └── seed.sql                  datos de demostración de Villavicencio
│
├── documentation/                análisis · arquitectura · modelo de datos ·
│                                 plan de fases · API · manual de usuario
├── .env.example
├── docker-compose.yml
└── package.json
```

---

## ⚙️ Requisitos

| Requisito | Versión mínima | Verificar con |
|-----------|----------------|---------------|
| Node.js | 18 (probado en 24) | `node -v` |
| npm | 9 | `npm -v` |
| Navegador | Chrome / Edge / Firefox actual | — |

**No necesitas instalar PostgreSQL ni Docker.** El proyecto trae PostgreSQL 16
como dependencia de desarrollo (`embedded-postgres`): `npm install` descarga los
binarios oficiales y `npm run db:up` levanta el servidor. Docker sigue siendo
opcional para quien lo prefiera (ver `docker-compose.yml` y los scripts
`npm run docker:*`).

---

## 🚀 Instalación

### 1. Ubicarse en el proyecto

```powershell
cd "C:\Users\yeife\OneDrive\Desktop\UNIVERISDAD 2026-2\WEB Y SISTEMAS MOBILES\proyecto final"
```

### 2. Configurar las variables de entorno

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
```

Abre `backend\.env` y reemplaza los valores marcados como `CAMBIAR`.
Para generar claves seguras:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Usa una clave distinta para `JWT_SECRET` y otra para `JWT_REFRESH_SECRET`.
`DB_PASSWORD` debe coincidir con `POSTGRES_PASSWORD` del `.env` de la raíz.

### 3. Instalar dependencias

```powershell
npm run install:all
```

### 4. Levantar la base de datos

```powershell
npm run db:up
```

La primera vez crea el clúster; después solo arranca el servidor. El comando
**termina y devuelve el control**: PostgreSQL queda corriendo en segundo plano
en el puerto 5432.

> 📂 **Dónde viven los datos.** El clúster se crea en
> `%LOCALAPPDATA%\ers-postgres\data`, **fuera** de la carpeta del proyecto. Es
> intencional: este proyecto está dentro de OneDrive, y OneDrive sincronizando
> los archivos mientras PostgreSQL los escribe puede corromper la base de datos.
> Se puede cambiar con `PGDATA_DIR` en `backend\.env`.

> 💡 Si prefieres Docker o una instalación normal de PostgreSQL, mira
> [`database/README.md`](database/README.md).

### 5. Cargar el esquema y los datos de demostración

```powershell
npm run db:schema
npm run db:seed
```

`db:schema` crea las 17 tablas, sus índices, 4 vistas y 2 triggers.
`db:seed` inserta 12 usuarios, 6 unidades y 25 emergencias repartidas en los
últimos 30 días y en los cuatro estados. Ambos comandos son **idempotentes**:
se pueden repetir para dejar la demostración en su estado inicial.

### 6. Ejecutar el sistema

```powershell
npm run dev
```

Abre <http://localhost:4000>.

---

## 📜 Scripts disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run install:all` | Instala las dependencias del backend. |
| `npm run dev` | Servidor en modo desarrollo con recarga automática (nodemon). |
| `npm start` | Servidor en modo producción. |
| `npm run db:up` | Arranca PostgreSQL (lo crea la primera vez). |
| `npm run db:down` | Detiene PostgreSQL. |
| `npm run db:status` | Dice si PostgreSQL está corriendo y dónde están los datos. |
| `npm run db:sql` | Abre una consola SQL interactiva contra `ers_db`. |
| `npm run db:reset` | ⚠️ Borra el clúster completo y empieza de cero. |
| `npm run db:schema` | Crea tablas, índices, vistas y triggers. |
| `npm run db:seed` | Carga los datos de demostración. |
| `npm run check` | Verifica la sintaxis del backend. |
| `npm run docker:up` / `docker:down` | Alternativa con Docker, si lo tienes instalado. |

---

## 🔐 Variables de entorno

Las variables están documentadas una por una en
[`backend/.env.example`](backend/.env.example). Las esenciales:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (por defecto 4000). |
| `DB_HOST` · `DB_PORT` · `DB_NAME` · `DB_USER` · `DB_PASSWORD` | Conexión a PostgreSQL. |
| `JWT_SECRET` · `JWT_REFRESH_SECRET` | Claves de firma de los tokens. **Obligatorias.** |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma. |
| `MAX_FILE_SIZE_MB` · `MAX_FILES_PER_EMERGENCY` | Límites de las fotografías. |
| `DEFAULT_LAT` · `DEFAULT_LNG` | Centro del mapa (Villavicencio). |

> ⚠️ El archivo `.env` está en `.gitignore` y **nunca** debe subirse a un repositorio.

---

## 🧪 Usuarios de prueba

Los crea `npm run db:seed`. **Todos usan la misma contraseña:**

```text
Emergencia2026*
```

| Rol | Correo | Notas |
|-----|--------|-------|
| 👑 Administrador | `admin@ers.gov.co` | Acceso total: usuarios, personal, auditoría y configuración. |
| 👨‍💻 Operador | `operador1@ers.gov.co` | Centro de control: gestiona y asigna. |
| 👨‍💻 Operador | `operador2@ers.gov.co` | Segundo operador. |
| 👤 Ciudadano | `maria.ruiz@example.com` | Tiene emergencias reportadas y notificaciones. |
| 👤 Ciudadano | `jorge.castro@example.com` | Sirve para comprobar el aislamiento entre ciudadanos. |
| 👤 Ciudadano | `diana.saenz@example.com` | — |
| 🚑 Paramédico | `camilo.ospina@ers.gov.co` | Unidad **UM-01**, ocupada. |
| 🚑 Paramédico | `natalia.rios@ers.gov.co` | Unidad **UM-03**, disponible. |
| 🚒 Bombero | `oscar.duarte@ers.gov.co` | Unidad **MB-01**, ocupada. |
| 🚒 Bombero | `ricardo.pena@ers.gov.co` | Unidad **MB-02**, disponible. |
| 🚓 Policía | `sandra.vargas@ers.gov.co` | Unidad **PT-05**, ocupada. |
| 🧗 Rescatista | `julian.torres@ers.gov.co` | Unidad **RS-02**, fuera de servicio. |

> ⚠️ Son credenciales de **demostración**. En un despliegue real hay que
> cambiarlas antes de exponer el sistema.

**Datos incluidos:** 25 emergencias (14 resueltas, 3 canceladas, 4 en proceso y
4 pendientes), 4 de ellas SOS, repartidas en las 10 zonas de Villavicencio y en
los últimos 30 días, con sus asignaciones, historial y notificaciones.

---

## 🔌 API REST

El contrato completo está en
[`documentation/05-API-REST.md`](documentation/05-API-REST.md).
Todas las respuestas tienen la forma `{ success, message, data, meta }`.
Autenticación: `Authorization: Bearer <accessToken>`.

**Autenticación** — `/api/auth`

| Método | Ruta | Acceso |
|--------|------|--------|
| POST | `/register` · `/login` · `/refresh` | Público |
| POST | `/logout` | Autenticado |
| GET · PUT | `/profile` | Autenticado |
| PATCH | `/password` | Autenticado |

**Emergencias** — `/api/emergencies`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/` · `/map` | Operador, admin |
| GET | `/mine` | Ciudadano |
| GET | `/assigned` | Personal |
| GET | `/:id` · `/:id/history` | Según rol (ver matriz de permisos) |
| POST | `/` | Ciudadano, operador, admin (`multipart/form-data` con fotos) |
| POST | `/sos` | Ciudadano — prioridad CRÍTICA automática |
| PUT | `/:id` | Operador, admin |
| PATCH | `/:id/status` | Personal (asignadas), operador, admin |
| PATCH | `/:id/priority` | Operador, admin |
| POST | `/:id/assign` | Operador, admin |
| DELETE | `/:id/assign/:assignmentId` | Operador, admin |
| POST | `/:id/comments` | Personal, operador, admin |
| POST | `/:id/photos` | Ciudadano, personal, operador, admin |
| DELETE | `/:id` | Admin (baja lógica) |

**Personal** — `/api/responders`

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/` · `/available` · `/:id` | Operador, admin |
| GET | `/me` · PATCH `/me/location` | Personal |
| POST · PUT | `/` · `/:id` | Admin |
| PATCH | `/:id/status` | Personal (propio), operador, admin |

**Resto de módulos**

| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/api/users` · `/:id` · POST · PUT · PATCH `/:id/status` · `/:id/role` · DELETE | Admin |
| GET | `/api/catalogs` · `/types` · `/statuses` · `/priorities` · `/roles` · `/zones` | Autenticado |
| GET | `/api/statistics/dashboard` · `/emergencies/*` · `/response-time` | Operador, admin |
| GET | `/api/notifications` · `/unread-count` · PATCH `/:id/read` · `/read-all` | Autenticado |
| GET | `/api/audit` | Admin |
| GET · PUT | `/api/settings` | Admin |
| GET | `/api/health` · `/api/config` | Público |

---

## ⚡ Tiempo real (Socket.IO)

Socket.IO comparte el **mismo puerto** que Express (`http://localhost:4000`), así
que no hay que configurar nada extra en el cliente.

### Conexión

El socket exige el mismo `accessToken` que la API REST. Sin token válido la
conexión se rechaza en el *handshake*, antes de establecerse:

```javascript
const socket = io('http://localhost:4000', {
  auth: { token: accessToken },
});

socket.on('connection:ready', (info) => {
  console.log('Conectado como', info.role, 'en las salas', info.rooms);
});
```

### Salas

Cada usuario entra **solo** en las salas que su rol permite. Esto es lo que
impide que un ciudadano escuche las emergencias de toda la ciudad.

| Sala | Quién entra | Qué recibe |
|------|-------------|------------|
| `control-room` | Operador y administrador | Todo el flujo de emergencias y unidades. |
| `responders` | Personal de emergencia | Cambios de estado de las emergencias. |
| `user:<id>` | Cada usuario, en todas sus pestañas | Sus notificaciones y sus reportes. |
| `emergency:<id>` | Quien tiene abierto ese detalle | Actualizaciones de esa emergencia. |

### Eventos del servidor al cliente

| Evento | Va a | Cuándo |
|--------|------|--------|
| `emergency:new` | control-room, autor | Se reporta una emergencia. |
| `sos:activated` | control-room | Se activa el botón SOS (además de `emergency:new`). |
| `emergency:update` | control-room, detalle, autor | Cambian datos o prioridad. |
| `emergency:status` | control-room, detalle, autor, responders | Cambia el estado (incluye `previous_status`). |
| `emergency:resolved` | control-room, autor | La emergencia se cierra. |
| `emergency:assigned` | control-room, detalle, autor, unidad | Se asigna o se retira personal. |
| `responder:location:update` | control-room | Una unidad reporta su posición GPS. |
| `responder:status:update` | control-room | Cambia la disponibilidad de una unidad. |
| `notification:new` | `user:<id>` | Llega una notificación a esa bandeja. |
| `stats:update` | control-room | Los contadores del dashboard cambiaron. |

> `stats:update` **no lleva las cifras**: es una señal para que el cliente
> vuelva a pedir `/api/statistics/dashboard`. Recalcular en cada evento sería
> caro y llegaría desordenado si dos cambios ocurren a la vez; así el dashboard
> siempre pinta un estado consistente.

### Eventos del cliente al servidor

| Evento | Qué hace |
|--------|----------|
| `emergency:subscribe` | Sigue una emergencia. Valida el permiso antes de unir a la sala. |
| `emergency:unsubscribe` | Deja de seguirla. |
| `rooms:list` | Diagnóstico: devuelve las salas del socket. |

Los tres aceptan *callback* de confirmación: `socket.emit('emergency:subscribe', id, (r) => …)`.

---

## 🖥️ Panel web

Todo es **HTML + CSS + JavaScript vanilla**, con módulos ES6 nativos. No hay
build, ni bundler, ni transpilación: se abre el archivo en VS Code y se edita.

### Páginas

| Archivo | Quién entra | Qué hace |
|---------|-------------|----------|
| `login.html` | Público | Acceso. No muestra ninguna credencial. |
| `register.html` | Público | Alta de cuenta ciudadana. Entra con la sesión ya iniciada. |
| `pages/dashboard.html` | Operador, admin | Indicadores en vivo, emergencias activas y estado de las unidades. |
| `pages/emergencies.html` | Todos | Listado con búsqueda, 5 filtros, ordenamiento y paginación. |
| `pages/emergency-detail.html` | Según rol | Detalle, historial, asignación, cambio de estado y prioridad. |
| `pages/map.html` | Operador, admin | Mapa con marcadores por prioridad y tipo. |
| `pages/users.html` | Admin | Alta, edición, roles y activación de cuentas. Descarga del Excel de accesos. |
| `pages/responders.html` | Operador, admin | Unidades, disponibilidad y última posición. |
| `pages/statistics.html` | Operador, admin | 7 gráficos y comparación con los objetivos. |
| `pages/notifications.html` | Todos | Bandeja de avisos y gestión de las notificaciones del navegador. |
| `pages/audit.html` | Admin | Bitácora de quién hizo qué y cuándo. Solo lectura. |
| `pages/settings.html` | Admin | Configuración del sistema y estado del servidor. |

### Organización del JavaScript

```text
js/
├── core/
│   ├── config.js   tokens de diseño, rutas, catálogos y nombres de eventos
│   ├── api.js      cliente REST: renueva el token solo al recibir un 401
│   ├── auth.js     sesión, roles y protección de páginas
│   ├── socket.js   cliente de tiempo real
│   ├── ui.js       avisos, modales, formularios y estados de carga
│   └── utils.js    fechas, formato, validación y almacenamiento
├── components/
│   └── layout.js   barra lateral y navbar, construidas según el rol
└── pages/          un módulo por página
```

### Detalles que vale la pena conocer

- **Una sola página de emergencias sirve a los tres perfiles.** El trabajo es el
  mismo (buscar, filtrar, abrir) y solo cambia el conjunto de datos, así que la
  página consulta `/emergencies`, `/emergencies/assigned` o `/emergencies/mine`
  según el rol, y oculta los filtros que no le corresponden.
- **La protección de páginas es de experiencia de usuario, no de seguridad.**
  Quien decide es el backend, que valida token y rol en cada petición; el
  frontend solo evita mostrar una pantalla que no traería datos.
- **Los filtros viven en la URL**, así que se puede recargar o compartir un
  enlace sin perder la vista.
- **El token se renueva solo.** Si una petición devuelve 401, el cliente pide un
  token nuevo y reintenta sin que el usuario note nada.
- **Tema claro y oscuro**, recordado entre visitas, y barra lateral contraíble.

---

## 🗺️ Mapas

Leaflet + OpenStreetMap, **sin servicios de pago y sin CDN**: la librería vive
en `frontend/vendor/leaflet/`, así que el mapa funciona aunque la red bloquee
unpkg. Solo las teselas necesitan internet.

### Dónde aparece

| Página | Qué muestra |
|--------|-------------|
| `pages/map.html` | Todas las emergencias y unidades, con capas, filtros y leyenda. |
| `pages/emergency-detail.html` | Mapa pequeño con la ubicación exacta del incidente. |

### Marcadores

Se dibujan con **`divIcon` (HTML), no con imágenes**. El motivo es concreto: el
color y el símbolo salen del catálogo de la base de datos, y con PNG haría falta
un archivo por cada combinación de tipo, prioridad y estado — cambiar un color
obligaría a reexportar imágenes.

- **Emergencias** — gota invertida. El **color** lo da la prioridad (es lo que
  marca la urgencia) y el **símbolo** el tipo (es lo que dice de qué se trata).
  Las cerradas se atenúan; las **SOS** llevan un anillo pulsante y se dibujan por
  encima del resto.
- **Unidades** — círculo. Verde disponible, naranja ocupada, gris fuera de
  servicio.

### Tiempo real

Una emergencia nueva **aparece sola** en el mapa; si es un SOS, además el mapa
vuela hasta ella y abre su ficha. Cuando una unidad reporta su posición, su
marcador **se desplaza** en lugar de recrearse, así no parpadea ni se cierra la
ventana emergente que el operador tuviera abierta.

En tema oscuro las teselas se atenúan por CSS, para no deslumbrar en una sala de
control a media luz.

---

## 📱 Aplicación móvil (PWA)

La app del ciudadano vive en `/app/` y es una **PWA instalable**: mismo HTML,
CSS y JavaScript vanilla, sin framework ni empaquetado.

| Pantalla | Qué hace |
|----------|----------|
| `app/index.html` | Botón SOS, accesos rápidos y último reporte. |
| `app/report.html` | Formulario con tipo, GPS, fotografías y prioridad. |
| `app/my-emergencies.html` | Lista de reportes con carga incremental. |
| `app/emergency.html` | Seguimiento paso a paso, mapa, fotos e historial. |
| `app/notifications.html` | Bandeja de avisos. |
| `app/offline.html` | Pantalla cuando no hay red ni copia guardada. |

### Botón SOS

Se activa **manteniéndolo pulsado 2 segundos**, no con un toque. Un botón rojo
enorme que dispara al primer roce se activaría solo dentro del bolsillo;
mantener pulsado exige intención. Durante la cuenta atrás se puede soltar para
cancelar.

Antes de enviar pide la ubicación. Si el GPS falla, pregunta si enviar de todas
formas y redirige al formulario para escribir la dirección a mano: es preferible
un aviso sin coordenadas a ningún aviso.

### El ciudadano entra directo a la app

`homeForRole()` es el único punto del sistema donde el destino depende del
dispositivo, y solo para el ciudadano: en una pantalla de menos de 720 px va a
`/app/index.html` y en una grande al panel.

El motivo es que **el botón SOS, la cámara y el GPS están en la PWA, no en el
panel**. Un ciudadano que entrara desde el teléfono y aterrizara en la tabla del
panel se quedaba sin la función principal del sistema, sin ninguna pista de que
existía otra pantalla. Para el caso contrario —un ciudadano en el panel que
quiere el SOS— su menú de usuario tiene la entrada *Abrir la app de
emergencias*.

### Permisos de ubicación

Una página web **no puede abrir la ventana de permiso del navegador cuando
quiere**. La saca el navegador, y solo si el permiso está *por preguntar*. Si el
usuario ya dijo que no, no vuelve a aparecer; hay que cambiarla a mano.

Por eso `js/core/geo.js` no intenta forzarla: distingue los tres casos y, cuando
no hay ventana del navegador que mostrar, abre una propia con los pasos
concretos.

| Caso | Qué se le dice |
|------|----------------|
| Origen no seguro (`http://192.168.x.x`) | Que el navegador bloquea el GPS en esa dirección y **no hay ajuste que cambiar**; se dan los pasos del reenvío por USB. |
| El usuario pulsó *Bloquear* | Dónde está el ajuste, paso a paso, en Chrome Android y en Safari iPhone. |
| GPS apagado o sin señal | Que salga al exterior y reintente. |

La distinción del primer caso importa más de lo que parece: el navegador
devuelve para él **el mismo código de error** que para un rechazo del usuario
(código 1). Tratarlos igual —como se hacía antes— mandaba al usuario a buscar
en los ajustes un permiso que ahí no existe.

En el SOS la ventana **no** se abre antes de enviar: primero se resuelve lo
urgente y solo después se explica. Un tutorial delante en mitad de una
emergencia sería lo contrario de ayudar.

### Fotografías

Dos botones distintos —**Cámara** y **Galería**— porque un solo `<input>` no
puede ofrecer ambas cosas de forma fiable en Android (`capture="environment"`
abre la cámara trasera directamente).

Las fotos se **reducen en el navegador antes de subirlas**: una foto de un móvil
actual pesa entre 3 y 8 MB y el límite del servidor son 5 MB. Redimensionar a
1600 px deja archivos de unos 300 KB sin perder detalle útil. En la prueba, una
imagen de 3000×2000 pasó de 205 KB a 25 KB.

### Modo sin conexión

El service worker usa tres estrategias, cada una por un motivo:

| Contenido | Estrategia | Por qué |
|-----------|-----------|---------|
| App (HTML, CSS, JS, Leaflet) | *stale while revalidate* | Abre al instante incluso con mala señal. |
| API | *network first* | Una emergencia con datos viejos sería peligrosa. |
| Teselas del mapa | *cache first* (máx. 300) | Son inmutables y pesadas. |
| POST / PATCH / DELETE | nunca se cachean | Son acciones que deben llegar al servidor. |

> Al cambiar un archivo de la lista `PRECACHE`, sube `CACHE_VERSION` en
> `service-worker.js`. Si no, los navegadores seguirán sirviendo la copia vieja.

### Instalarla en un teléfono Android

Aquí hay un detalle que **no es obvio y conviene resolver antes de una
demostración**: los service workers solo funcionan en HTTPS o en `localhost`.
Si abres `http://192.168.x.x:4000` desde el móvil, la app se ve pero **no se
instala** porque ese origen no es seguro.

La forma más limpia de resolverlo, sin certificados ni servicios externos:

1. Activa las **opciones de desarrollador** y la **depuración USB** en el móvil.
2. Conéctalo por USB al computador.
3. En el Chrome del computador abre `chrome://inspect/#devices`.
4. Pulsa **Port forwarding**, añade la regla `4000` → `localhost:4000` y activa
   la casilla.
5. En el Chrome del móvil abre `http://localhost:4000/app/index.html`.

El teléfono ve el servidor como `localhost`, así que **es contexto seguro**: el
service worker se registra y aparece "Añadir a pantalla de inicio".

Alternativa sin cable: un túnel HTTPS (`ngrok http 4000` o
`cloudflared tunnel --url http://localhost:4000`) y abrir la URL `https://` que
devuelva.

---

## 📊 Estadísticas

`pages/statistics.html` — siete gráficos con **Chart.js 4**, alojado en el
proyecto (`vendor/chartjs/`) igual que Leaflet.

| Gráfico | Tipo | Qué muestra |
|---------|------|-------------|
| Emergencias por día | Línea doble | Total reportadas y cuántas fueron SOS |
| Por tipo | Barras horizontales | Los 7 tipos del catálogo |
| Por estado | Dona | Distribución del ciclo de vida |
| Por prioridad | Barras | De la más urgente a la menos |
| Por zona | Barras horizontales | Comunas y áreas rurales |
| Tiempo de respuesta | Línea | Evolución de los minutos hasta la asignación |
| Carga por unidad | Barras apiladas | Completadas frente a las que siguen en curso |

Más una comparación **respuesta frente al objetivo**: cada prioridad tiene su
propio tiempo objetivo (`priorities.target_minutes`) y la barra se pinta verde
o roja según se cumpla, con una marca vertical en el objetivo. No es un gráfico
porque lo que importa es si se cumple o no, y eso se lee mejor así.

### Detalles que conviene conocer

- **Ni un número escrito a mano.** Todo sale de la API, que lo calcula con SQL.
  Los colores tampoco: llegan en la respuesta porque están en los catálogos de
  la base, así el rojo de «crítica» es el mismo en el gráfico, en la tabla y en
  el marcador del mapa.
- **Los días sin emergencias aparecen como cero**, no se saltan:
  `generate_series` los rellena en SQL. Sin eso la línea saltaría del día 3 al
  7 y mentiría sobre la tendencia.
- **La tasa de resolución se calcula sobre las cerradas**, no sobre el total.
  Incluir las abiertas en el denominador la haría bajar solo por haber trabajo
  en curso.
- **Una prioridad sin emergencias asignadas no se pinta** en la comparación con
  objetivos: no hay promedio que mostrar.
- Los gráficos se **repintan al cambiar el tema** claro/oscuro, porque los
  colores de ejes y leyendas se leen al construirlos.

---

## 🔔 Notificaciones

Un aviso llega por **tres canales que se complementan**, no que se repiten:

| Canal | Cuándo actúa | Persistencia |
|-------|--------------|--------------|
| **Bandeja** (tabla `notifications`) | Siempre | Es la fuente de verdad; sobrevive a todo |
| **Socket.IO** | La app está abierta | Ninguna, es instantáneo |
| **Web Push** | La app está cerrada | El navegador lo entrega igual |

Un solo punto del código decide cómo se entrega un aviso:
`notificationService.deliver()`. Se llama **siempre después del COMMIT** —
anunciar algo que aún podría revertirse dejaría al usuario viendo el aviso de
una emergencia inexistente.

### Por qué Web Push y no Firebase

Web Push es el estándar del navegador. En Android, Chrome ya entrega estos
mensajes a través de la infraestructura de Google —la misma que hay detrás de
FCM— **sin que el backend tenga que registrarse en ningún servicio ni guardar
credenciales de terceros**.

Las claves VAPID las genera el propio proyecto:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

No son credenciales de nadie más: identifican a *tu* servidor ante el
navegador. La privada nunca sale del backend. Si `PUSH_ENABLED=false` o faltan
las claves, el sistema sigue funcionando con la bandeja y Socket.IO.

### Endpoints

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/notifications/push-key` | Clave pública para suscribirse |
| POST | `/api/notifications/subscribe` | Registra este navegador |
| DELETE | `/api/notifications/subscribe` | Da de baja este navegador |
| POST | `/api/notifications/test` | Envío de prueba a uno mismo |

Una suscripción que el navegador declara muerta (404 o 410) se borra al
instante; a los 5 fallos seguidos también. Reintentar sobre un navegador que ya
no existe solo gastaría tiempo en cada notificación.

### Activarlas

En la app móvil: **Avisos → Activar**. Requiere las mismas condiciones que la
instalación de la PWA (service worker registrado y contexto seguro), así que
aplica lo explicado en el apartado anterior sobre `localhost` o HTTPS.

> ⚠️ El envío efectivo a un dispositivo físico **no se ha comprobado** todavía:
> el navegador del entorno de desarrollo no registra service workers. Lo que sí
> está verificado es el lado del servidor —las claves se generan, los endpoints
> responden y la validación de la suscripción funciona—.

---

## 🔐 Seguridad

### Medidas aplicadas

| Riesgo | Cómo se aborda |
|--------|----------------|
| Contraseñas expuestas | bcrypt con 12 rondas. El hash **nunca** sale de `user.model.js` salvo en el login. |
| Sesiones robadas | Dos tokens: acceso de 15 min y refresco de 7 días **con rotación** — usarlo dos veces lo invalida. |
| Fuerza bruta | 5 intentos por ventana en `/auth/*`. Un SOS tiene su propio límite para que nunca quede bloqueado por el general. |
| Inyección SQL | SQL parametrizado siempre. El único texto que se concatena es la columna de ordenamiento, validada contra lista blanca. |
| XSS | `escapeHtml()` en todo dato de usuario insertado en HTML. `el()` distingue `text:` (seguro) de `html:`. |
| Escalada de privilegios | Tres niveles: token válido → rol permitido → registros visibles. El último vive en la capa de servicios. |
| Cabeceras | Helmet con CSP explícita, `nosniff`, `X-Frame-Options`, sin `X-Powered-By`. |
| Subida de archivos | Nombre aleatorio (nunca el del usuario), extensión deducida del MIME, lista blanca de tipos, límite de tamaño y cantidad. |
| Trazabilidad | `audit_logs` registra accesos, cambios de rol, asignaciones y cambios de estado. |

### Vulnerabilidad encontrada y corregida

La auditoría de la Fase 15 encontró un fallo **explotable**, no teórico:

`app.set('trust proxy', 1)` estaba fijo en el código. Sin un proxy inverso
real delante, Express toma la IP de la cabecera `X-Forwarded-For` — que la
escribe el cliente. Comprobado contra el sistema en ejecución:

```text
Antes:   6 intentos fallidos con X-Forwarded-For distinto → 401,401,401,401,401,401
         (ni un solo bloqueo: el limitador de fuerza bruta era inútil)

Después: 8 intentos con la misma técnica          → 401,401,401,401,429,429,429,429
```

La corrección: `TRUST_PROXY` es ahora una variable de entorno que **por defecto
vale 0**. Al desplegar detrás de Nginx o Render se pone en 1.

También se añadió el limitador a `/auth/refresh`, que estaba sin él siendo un
endpoint público, y se unificó el escapado de los valores de catálogo que van
dentro de atributos `style`.

### Limitaciones conocidas

- **Las fotografías en `/uploads` no exigen autenticación.** Los nombres son
  aleatorios de 32 caracteres hexadecimales, así que no se pueden adivinar,
  pero quien tenga el enlace puede abrirlo. Para producción habría que servirlas
  a través de un endpoint autenticado o con URLs firmadas que caduquen.
- **Existe una hoja de accesos con las contraseñas en texto plano.** Es una
  ayuda deliberada para la sustentación, no una función del sistema. Se explica
  justo debajo.

### Hoja de accesos (Excel)

La pantalla de acceso **ya no muestra ninguna credencial**: mostrar correos y
contraseñas válidos en la propia página de entrada es justo lo que un sistema de
emergencias no debe hacer. Los accesos de prueba se consultan ahora en un lugar
que exige ser administrador.

El administrador los descarga en **Usuarios → "Excel de accesos"**, o desde
`GET /api/users/credentials.xlsx`. El archivo también queda en disco, en
`backend/storage/credenciales/`, y **se regenera solo** cada vez que se crea o
se elimina un usuario.

| Columna | De dónde sale |
|---------|---------------|
| Datos del usuario | De la tabla `users`, en el momento de generar el archivo. |
| Contraseña de un usuario creado desde el panel | Se anota al crearlo, en `registro.json`. |
| Contraseña de un usuario de `seed.sql` | La documentada en ese archivo. |
| Contraseña cambiada por el propio usuario | **No aparece.** La base solo guarda el hash bcrypt, que es irreversible. La hoja lo dice en la fila en lugar de inventarla. |

Tres salvaguardas, porque el archivo contiene contraseñas en claro:

- Está en `.gitignore`: nunca llega al repositorio.
- El endpoint exige sesión de **administrador** (sin token responde `401`).
- Se apaga entero con `CREDENTIALS_SHEET_ENABLED=false`. **En cualquier
  despliegue real debe ir en `false`.**

---

## 🧪 Pruebas

Tres suites que se ejecutan **contra el sistema en funcionamiento**, no contra
piezas aisladas. Requieren la base de datos y el servidor levantados.

```bash
npm test              # API REST + tiempo real
npm run test:api      # 92 comprobaciones
npm run test:realtime # 49 comprobaciones
npm run test:security # 41 comprobaciones
```

| Suite | Comprobaciones | Qué cubre |
|-------|:--------------:|-----------|
| `tests/api.test.js` | 92 | Autenticación, los 4 roles, validación, SOS, asignaciones, transiciones, estadísticas, mapa, notificaciones, usuarios, auditoría y sesiones. |
| `tests/realtime.test.js` | 49 | Cuatro clientes simultáneos con roles distintos; verifica que cada evento llegue **solo** a sus destinatarios. |
| `tests/security.test.js` | 41 | Cabeceras, política de contraseñas, autorización, aislamiento de datos, tokens falsificados, inyección SQL y limitador. |
| **Total** | **182** | |

> ⚠️ `test:security` **agota el limitador de intentos a propósito**. Ejecútala
> la última, o reinicia el servidor antes de volver a probar el login: el
> contador vive en memoria y se limpia al reiniciar.

La prueba más significativa es la de aislamiento en tiempo real: un ciudadano
ajeno a un incidente no recibió **ningún** evento relacionado con él, y su
intento de suscribirse fue rechazado.

---

## 📈 Estado del desarrollo

| Fase | Nombre | Estado |
|:----:|--------|:------:|
| 1 | Análisis y arquitectura | ✅ |
| 2 | Estructura del proyecto | ✅ |
| 3 | Base de datos PostgreSQL | ✅ |
| 4 | Backend y API REST | ✅ |
| 5 | Autenticación y roles | ✅ |
| 6 | Módulo de emergencias | ✅ |
| 7 | Socket.IO | ✅ |
| 8 | Frontend web | ✅ |
| 9 | Mapas | ✅ |
| 10 | PWA | ✅ |
| 11 | GPS y SOS | ✅ |
| 12 | Fotografías | ✅ |
| 13 | Notificaciones | ✅ |
| 14 | Estadísticas | ✅ |
| 15 | Seguridad | ✅ |
| 16 | Pruebas | ✅ |
| 17 | Corrección | ✅ |
| 18 | Documentación final | ✅ |

Detalle en [`documentation/04-PLAN-DE-FASES.md`](documentation/04-PLAN-DE-FASES.md).

---

## 🛠️ Solución de problemas

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| `EADDRINUSE: port 4000` | Otro proceso usa el puerto. | Cambia `PORT` en `backend/.env`. |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está arriba. | `npm run db:up` y espera unos segundos. |
| `password authentication failed` | `DB_PASSWORD` no coincide. | Iguala `backend/.env` con el `.env` de la raíz. |
| "Faltan variables de entorno obligatorias" | Quedaron los valores `CAMBIAR`. | Completa `backend/.env`. |
| El navegador no pide la ubicación | Abriste el `.html` con doble clic. | Entra por `http://localhost:4000`. |
| `ERR_CONNECTION_REFUSED` al abrir `localhost:4000` **en el móvil** | Para el teléfono, `localhost` es el propio teléfono, no tu computador. | Usa la dirección de red que imprime el servidor al arrancar (`http://192.168.x.x:4000/app/index.html`), con ambos en la misma Wi-Fi. Para *instalar* la PWA hace falta además el reenvío de puertos por USB. |
| La aplicación sale **sin estilos** por la IP de la red (letra serif, enlaces azules) y la consola muestra `ERR_SSL_PROTOCOL_ERROR` | La CSP llevaba `upgrade-insecure-requests`: el navegador pedía los CSS y el JS por `https://` contra un servidor HTTP. | Ya está corregido en `app.js` (la directiva solo se aplica en producción). Si vuelve a aparecer, comprueba que `NODE_ENV` no está en `production` en desarrollo. |
| "Permiso de ubicación denegado" y **el navegador no pregunta nada** | Si entraste por `http://192.168.x.x`, el navegador deniega el GPS solo: no es un permiso que puedas conceder. | La app ahora lo explica en pantalla con los pasos. Para tener GPS de verdad en el móvil, entra por `localhost` con el reenvío de puertos por USB. |
| El ciudadano entra desde el móvil y **no ve el botón SOS** | Estás en el panel (`/pages/…`), no en la PWA (`/app/…`). | Al iniciar sesión en una pantalla pequeña ya va directo a la app. Si estás en el panel, usa *Abrir la app de emergencias* en tu menú de usuario. |
| La instalación de npm es muy lenta | `node_modules` se sincroniza con OneDrive. | Pausa la sincronización mientras instalas. |
| `docker compose` no se reconoce | Docker Desktop no está iniciado. | Ábrelo y espera a que diga *Running*, o usa `npm run db:up`, que no necesita Docker. |
| `No se encontraron los binarios de PostgreSQL` | La descarga de `embedded-postgres` quedó incompleta. | Vuelve a ejecutar `npm install` dentro de `backend/`. |
| `npm run db:up` parece colgarse | Estás en una terminal que espera a que el proceso hijo cierre la salida. | Ya está resuelto en `scripts/db-local.js`; si lo modificas, mantén `stdio: 'ignore'` en el `pg_ctl start`. |

---

## 📄 Documentación

| Documento | Contenido |
|-----------|-----------|
| [01 — Análisis de requisitos](documentation/01-ANALISIS-REQUISITOS.md) | Actores, requisitos funcionales y no funcionales, reglas de negocio. |
| [02 — Arquitectura](documentation/02-ARQUITECTURA.md) | Capas, componentes, seguridad, eventos en tiempo real. |
| [03 — Modelo de datos](documentation/03-MODELO-DATOS.md) | Entidades, relaciones, normalización, índices. |
| [04 — Plan de fases](documentation/04-PLAN-DE-FASES.md) | Estado y orden de desarrollo. |
| [05 — API REST](documentation/05-API-REST.md) | Contrato completo de endpoints. |
| [06 — Manual de usuario](documentation/06-MANUAL-USUARIO.md) | Guía práctica por rol: ciudadano, personal, operador y administrador. |

### Entregables académicos

| Archivo | Contenido |
|---------|-----------|
| [Documento de avance](documentation/Avance-Proyecto-ERS-Yeifer-Medina.docx) | Informe en norma IEEE con la estructura exigida por la Facultad. |
| [Presentación](documentation/Presentacion-ERS-Yeifer-Medina.pptx) | 15 diapositivas con notas del ponente. |

---

<div align="center">

**Yeifer Herley Medina Cruz** (923671) · **Juan Camilo Lombana Gutiérrez** (909524)

Ingeniería de Sistemas · Universidad Cooperativa de Colombia · 2026-2

</div>
