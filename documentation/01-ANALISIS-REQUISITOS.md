# 01 — Análisis de Requisitos
## Emergency Response System (ERS)

> Fase 1 — Análisis. Documento base del proyecto.
> Universidad — Web y Sistemas Móviles — 2026-2

---

## 1. Descripción del problema

En una ciudad intermedia como **Villavicencio (Meta, Colombia)** la atención de
emergencias depende de llamadas telefónicas a líneas separadas (123, bomberos,
policía, ambulancias). Esto genera tres problemas concretos:

1. **Pérdida de la ubicación exacta.** El ciudadano describe verbalmente dónde está;
   el operador transcribe. En zonas sin nomenclatura clara esto cuesta minutos.
2. **Falta de trazabilidad.** El ciudadano no sabe si su reporte fue recibido,
   asignado o atendido.
3. **Despacho a ciegas.** El operador no ve en un mapa qué unidades están
   disponibles ni cuál está más cerca del incidente.

El **Emergency Response System** ataca los tres puntos: captura la ubicación GPS
automáticamente, mantiene un historial de estados visible para el ciudadano y
entrega al operador un centro de control con mapa en tiempo real.

---

## 2. Objetivo general

Desarrollar una plataforma **web + móvil (PWA)** que permita a los ciudadanos
reportar emergencias con geolocalización y evidencia fotográfica, y a un centro de
control gestionar, asignar y hacer seguimiento de esas emergencias en tiempo real.

## 3. Objetivos específicos

| # | Objetivo |
|---|----------|
| OE-1 | Diseñar una base de datos relacional normalizada en PostgreSQL que soporte todo el ciclo de vida de una emergencia. |
| OE-2 | Construir una API REST segura con Node.js y Express, autenticación JWT y control de acceso por roles. |
| OE-3 | Implementar comunicación en tiempo real con Socket.IO para que el dashboard se actualice sin recargar. |
| OE-4 | Construir un panel de control web con HTML5, CSS3 y JavaScript vanilla, con mapa Leaflet + OpenStreetMap. |
| OE-5 | Entregar una PWA instalable en Android para el ciudadano, con botón SOS, GPS y cámara. |
| OE-6 | Generar estadísticas operativas reales (Chart.js) calculadas desde la base de datos. |

---

## 4. Alcance

### 4.1 Dentro del alcance

- Registro e inicio de sesión con 4 roles.
- Reporte de emergencias con tipo, descripción, prioridad, GPS y fotografías.
- Botón SOS con prioridad crítica automática.
- Panel de control: dashboard, mapa, listado, detalle, usuarios, personal,
  estadísticas, notificaciones, auditoría y configuración.
- Asignación de personal e historial completo de cambios de estado.
- Notificaciones internas (bandeja + tiempo real) preparadas para Firebase.
- PWA instalable con service worker y soporte offline básico.

### 4.2 Fuera del alcance (documentado como trabajo futuro)

- Integración real con líneas de emergencia oficiales (123).
- Envío de SMS o llamadas telefónicas.
- Credenciales reales de Firebase Cloud Messaging (se deja la arquitectura lista).
- Almacenamiento de fotos en la nube (S3/Cloudinary): se deja la capa abstraída.
- Aplicación nativa en tiendas (Play Store / App Store).

---

## 5. Actores del sistema

| Actor | Descripción | Canal principal |
|-------|-------------|-----------------|
| **Ciudadano** | Persona que reporta una emergencia. | PWA móvil |
| **Personal de emergencia** | Paramédico, bombero, policía o rescatista. | PWA móvil |
| **Operador** | Despachador del centro de control. | Panel web |
| **Administrador** | Gestiona usuarios, catálogos y configuración. | Panel web |

---

## 6. Requisitos funcionales

### 6.1 Autenticación y usuarios

| ID | Requisito | Actor |
|----|-----------|-------|
| RF-01 | Registrarse con nombre, documento, correo, teléfono y contraseña. | Ciudadano |
| RF-02 | Iniciar sesión con correo y contraseña y recibir un token JWT. | Todos |
| RF-03 | Cerrar sesión invalidando el token de refresco. | Todos |
| RF-04 | Consultar y editar el perfil propio. | Todos |
| RF-05 | Listar, buscar, filtrar y paginar usuarios. | Administrador |
| RF-06 | Crear, editar, activar y desactivar usuarios. | Administrador |
| RF-07 | Asignar y cambiar el rol de un usuario. | Administrador |

### 6.2 Emergencias

| ID | Requisito | Actor |
|----|-----------|-------|
| RF-08 | Crear una emergencia con tipo, título, descripción, prioridad y ubicación GPS. | Ciudadano |
| RF-09 | Adjuntar una o varias fotografías a la emergencia. | Ciudadano |
| RF-10 | Activar el botón SOS: crea una emergencia de prioridad CRÍTICA con la ubicación actual. | Ciudadano |
| RF-11 | Consultar el listado de emergencias propias con su estado. | Ciudadano |
| RF-12 | Consultar el seguimiento paso a paso de una emergencia. | Ciudadano |
| RF-13 | Listar todas las emergencias con búsqueda, filtros, orden y paginación. | Operador / Admin |
| RF-14 | Ver el detalle completo: usuario, mapa, fotos, historial y personal asignado. | Operador / Admin |
| RF-15 | Cambiar el estado de una emergencia (PENDIENTE → EN PROCESO → RESUELTO / CANCELADO). | Operador / Personal |
| RF-16 | Cambiar la prioridad de una emergencia. | Operador / Admin |
| RF-17 | Registrar automáticamente cada cambio en el historial. | Sistema |

### 6.3 Personal y asignaciones

| ID | Requisito | Actor |
|----|-----------|-------|
| RF-18 | Registrar personal con tipo, unidad, institución y estado. | Administrador |
| RF-19 | Consultar personal disponible cercano a una emergencia. | Operador |
| RF-20 | Asignar uno o varios responsables a una emergencia. | Operador / Admin |
| RF-21 | Actualizar la ubicación GPS del personal en servicio. | Personal |
| RF-22 | Marcar avances: en camino, en sitio, atendida. | Personal |
| RF-23 | Consultar las emergencias asignadas al personal autenticado. | Personal |

### 6.4 Tiempo real, notificaciones y estadísticas

| ID | Requisito | Actor |
|----|-----------|-------|
| RF-24 | El dashboard se actualiza automáticamente ante nuevos eventos (sin recargar). | Operador / Admin |
| RF-25 | Las emergencias SOS se destacan visual y sonoramente en el centro de control. | Operador / Admin |
| RF-26 | Recibir notificaciones internas por cambios relevantes. | Todos |
| RF-27 | Ver indicadores: activas, pendientes, en proceso, resueltas, SOS, personal disponible y tiempo promedio de respuesta. | Operador / Admin |
| RF-28 | Ver gráficos por día, tipo, estado, prioridad y zona. | Operador / Admin |
| RF-29 | Consultar el registro de auditoría del sistema. | Administrador |

---

## 7. Requisitos no funcionales

| ID | Categoría | Requisito |
|----|-----------|-----------|
| RNF-01 | Seguridad | Contraseñas cifradas con bcrypt (nunca en texto plano). |
| RNF-02 | Seguridad | Autenticación con JWT de acceso corto + token de refresco. |
| RNF-03 | Seguridad | Autorización por rol en cada endpoint protegido. |
| RNF-04 | Seguridad | Helmet, CORS restringido, rate limiting y validación/sanitización de entradas. |
| RNF-05 | Seguridad | Ningún secreto en el código: todo por variables de entorno. |
| RNF-06 | Rendimiento | Listados paginados; índices en las columnas de filtrado y orden. |
| RNF-07 | Usabilidad | Diseño responsive: panel web en escritorio/tablet, PWA en móvil. |
| RNF-08 | Disponibilidad | La PWA debe cargar su interfaz aun sin conexión (service worker). |
| RNF-09 | Mantenibilidad | Separación estricta: rutas → controladores → servicios → modelos. |
| RNF-10 | Portabilidad | PostgreSQL levantado con Docker Compose en un solo comando. |
| RNF-11 | Trazabilidad | Toda acción sensible queda en `audit_logs`. |
| RNF-12 | Compatibilidad | Frontend en HTML5/CSS3/JS ES6+ sin frameworks, editable desde VS Code. |

---

## 8. Reglas de negocio

| ID | Regla |
|----|-------|
| RN-01 | Toda emergencia nace en estado **PENDIENTE**. |
| RN-02 | Una emergencia creada por SOS recibe prioridad **CRÍTICA** y `es_sos = true` de forma automática. |
| RN-03 | Una emergencia pasa a **EN PROCESO** cuando tiene al menos un responsable asignado que confirma. |
| RN-04 | Solo se puede **RESOLVER** una emergencia que esté EN PROCESO. |
| RN-05 | Una emergencia **RESUELTA** o **CANCELADA** es final: no admite más cambios de estado. |
| RN-06 | Cancelar exige un motivo escrito. |
| RN-07 | Un responsable en estado OCUPADO no aparece en la lista de personal disponible. |
| RN-08 | Al asignar personal, este pasa automáticamente a **OCUPADO**; al cerrar la emergencia vuelve a **DISPONIBLE**. |
| RN-09 | El ciudadano solo puede ver sus propias emergencias. |
| RN-10 | El personal solo puede ver las emergencias que le fueron asignadas. |
| RN-11 | El tiempo de respuesta se mide desde `reportada_en` hasta `resuelta_en`. |
| RN-12 | Cada cambio de estado, prioridad o asignación escribe una fila en `emergency_history`. |

---

## 9. Ciclo de vida de una emergencia

```text
   [Ciudadano]                [Sistema]                 [Operador]            [Personal]
        |                         |                          |                     |
   Reporta / SOS  ───────────►  PENDIENTE                    |                     |
        |                         │  emite emergency:new ───► ve la tarjeta        |
        |                         |                          |                     |
        |                         │  ◄──── asigna personal ───┤                     |
        |                         |   emergency:assigned ─────┼───────────────────► recibe
        |  ◄── notificación ──────┤                          |                     |
        |                         |                          |                     │ en camino
        |                         │  ◄──────────────────────────────────────────────┤
        |                         │  EN PROCESO                                     │ en sitio
        |  ◄── notificación ──────┤   emergency:status ──────►                      |
        |                         |                          |                     │ atendida
        |                         │  RESUELTO ◄──────────────────────────────────────┤
        |  ◄── notificación ──────┤   emergency:resolved ────►                      |
```

Cada flecha que cambia el estado escribe una entrada en el historial, por ejemplo:

```text
10:30 — Emergencia creada por Yeifer Medina (SOS)
10:32 — Asignada a Unidad Médica 03 por operador.central
10:36 — Personal en camino
10:45 — Emergencia EN PROCESO
11:10 — Emergencia RESUELTA — paciente estabilizado y trasladado
```

---

## 10. Matriz de permisos por rol

| Acción | Ciudadano | Personal | Operador | Admin |
|--------|:---------:|:--------:|:--------:|:-----:|
| Registrarse / iniciar sesión | ✅ | ✅ | ✅ | ✅ |
| Crear emergencia / SOS | ✅ | — | ✅ | ✅ |
| Ver **sus** emergencias | ✅ | — | ✅ | ✅ |
| Ver emergencias **asignadas** | — | ✅ | ✅ | ✅ |
| Ver **todas** las emergencias | — | — | ✅ | ✅ |
| Cambiar estado | — | ✅ (asignadas) | ✅ | ✅ |
| Cambiar prioridad | — | — | ✅ | ✅ |
| Asignar personal | — | — | ✅ | ✅ |
| Actualizar ubicación propia | — | ✅ | — | — |
| Gestionar usuarios y roles | — | — | — | ✅ |
| Gestionar personal | — | — | ✅ (estado) | ✅ |
| Ver estadísticas | — | — | ✅ | ✅ |
| Ver auditoría | — | — | — | ✅ |
| Configurar el sistema | — | — | — | ✅ |

---

## 11. Contexto geográfico de los datos de prueba

Los datos de demostración se ubican en **Villavicencio, Meta, Colombia**.

- Centro del mapa: `4.1420, -73.6266`
- Zoom inicial: `13`
- Zonas usadas: Centro, Barzal, La Esperanza, Ciudad Porfía, El Buque,
  La Rosita, Catama, Villa Julia, Siete de Agosto y San Benito.

---

## 12. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| El navegador niega el permiso de ubicación. | Alto | Permitir ubicación manual sobre el mapa como alternativa. |
| La geolocalización exige HTTPS en producción. | Alto | Documentar despliegue con certificado; `localhost` funciona en desarrollo. |
| `node_modules` dentro de OneDrive puede sincronizarse y volverse lento. | Medio | `.gitignore` + nota en el README para pausar la sincronización. |
| Fotos pesadas saturan el disco. | Medio | Límite de tamaño y cantidad en multer; capa de almacenamiento abstraída. |
| Pérdida de conexión del operador. | Medio | Reconexión automática de Socket.IO + recarga por API al reconectar. |
