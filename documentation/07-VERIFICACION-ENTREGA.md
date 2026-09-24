# 07 — Verificación de la entrega

**Fecha:** 23 de septiembre de 2026
**Alcance:** revisión completa del sistema antes de la entrega: instalación
limpia, pruebas automáticas, recorrido de todas las pantallas en un navegador
real (escritorio y móvil), modo sin conexión, GPS, fotos, push y accesibilidad.

---

## 1. Resumen

| Verificación | Resultado |
|--------------|-----------|
| Instalación limpia siguiendo el README (carpeta nueva, PostgreSQL nuevo) | ✅ |
| Suite de la API (`npm run test:api`) | ✅ 109 / 109 |
| Suite de tiempo real (`npm run test:realtime`) | ✅ 51 / 51 |
| Suite de seguridad (`npm run test:security`) | ✅ 56 / 56 |
| Flujos de la PWA en móvil emulado (SOS, GPS, fotos, sin red, instalación) | ✅ 25 / 25 |
| Flujos del panel web (despacho completo, usuarios, configuración, recuperación de contraseña) | ✅ 25 / 25 |
| Uso solo con teclado (login, SOS, modales, tablas) | ✅ 9 / 9 |
| Push de extremo a extremo (Chrome → servicio push de Google → notificación) | ✅ |
| Auditoría automática WCAG 2.1 A/AA (axe-core), 21 pantallas en tema claro y oscuro | ✅ 42 / 42 sin violaciones |
| Reflujo a 320 px y a zoom 200 % (1366 px) | ✅ sin desbordes |

Durante la revisión aparecieron **35 fallos reales** (y dos más en producción, el 36 y el 37), todos corregidos (sección
4). Las tres suites pasaron de 182 a 216 comprobaciones para cubrirlos.

---

## 2. Cómo se probó

- **Instalación limpia:** se copió la carpeta de entrega (sin `node_modules`
  ni `.env`) a un directorio nuevo y se siguieron los pasos del README:
  `copy .env.example .env`, claves nuevas, `npm run install:all`,
  `npm run db:up` con un clúster **nuevo** en otro puerto, `db:schema`,
  `db:seed` (dos veces, para comprobar que es repetible) y arranque.
- **Entorno:** Windows 11, Node 24.20, npm 11.19, PostgreSQL 16.14
  (embedded-postgres), Chrome 140 sin interfaz controlado por el protocolo
  DevTools.
- **Móvil:** emulación de Android (390×844, 375×812 y 360×740, pantalla táctil,
  user agent de Chrome Android), GPS simulado con permiso concedido y denegado,
  red cortada tanto en la página como en el service worker.
- **Accesibilidad:** axe-core 4.13 con las reglas WCAG 2.1 A y AA en las 21
  pantallas, en los dos temas; recorrido con Tab/Enter/Escape; reflujo a 320 px
  y a 683 px (1366 px al 200 %).

---

## 3. Los puntos pendientes que se revisaron

| Punto pendiente | Estado |
|-----------------|--------|
| Instalación limpia en el equipo de entrega y pruebas de integración | ✅ Hecho en una carpeta nueva. Nota: en Windows, si la ruta de la carpeta es muy larga (más de ~200 caracteres hasta `initdb.exe`), `db:up` falla con *invalid binary*; ahora el mensaje lo explica. |
| `db:up`, `db:schema`, `db:seed`, arrancar y correr las tres suites | ✅ 216 / 216. La suite de seguridad **ya no bloquea cuentas reales**: el orden de las suites dejó de importar. |
| Móvil: GPS permitido y denegado, SOS cancelado y enviado, cámara/fotos, instalación, sin red, push | ✅ En móvil emulado, con correcciones importantes (sección 4). 👤 Falta repetirlo en un teléfono físico. |
| Teclado, lector de pantalla, 360–390 px, zoom 200 %, mensajes de error | ✅ Teclado, tamaños y zoom verificados; contraste y nombres accesibles corregidos. 👤 Falta una pasada con un lector de pantalla real (NVDA o TalkBack). |
| `PUBLIC_URL`, `CREDENTIALS_SHEET_ENABLED=false` y proveedor de correo en el despliegue | ✅ En código: en Render `PUBLIC_URL` se toma solo de `RENDER_EXTERNAL_URL`, la hoja de contraseñas viene apagada en producción y se añadieron Brevo y Resend (API HTTP). 👤 Falta configurar el correo en Render (sección 6). |
| Fotos públicas en `/uploads`; almacenamiento persistente y copias de seguridad | ✅ Decidido e implementado: enlaces firmados que caducan y fotos guardadas en PostgreSQL. 👤 Revisar la vigencia de la base gratuita de Render (sección 6). |

---

## 4. Fallos encontrados y corregidos

### Backend

| # | Fallo | Efecto | Corrección |
|---|-------|--------|------------|
| 1 | Tras un corte breve de red, Socket.IO recuperaba la sesión **sin** pasar por la autenticación | El socket quedaba sin usuario, lanzaba un `TypeError` y dejaba de responder a `emergency:subscribe` (el detalle abierto dejaba de actualizarse) | Autenticación también al recuperar; prueba de regresión en `realtime.test.js` §10 |
| 2 | El límite general de la API se aplicaba **antes** que el del SOS | Con el cupo agotado, un SOS recibía **429** (y `/api/health` también) | SOS y `/health` exentos; prueba en `security.test.js` §10 |
| 3 | El límite de intentos de login era solo por IP | Cinco contraseñas mal escritas por una persona bloqueaban el acceso de **toda** la red (un salón) 15 minutos | Límite por cuenta + IP, con tope por IP; prueba §11 |
| 4 | El límite general (300 / 15 min) también era por IP | Una red compartida o un operador navegando en una demostración podía agotarlo | Por usuario (por IP sin sesión), 1000 por defecto |
| 5 | Las suscripciones push aceptaban cualquier URL | El servidor hacía POST a esa URL en cada aviso: un usuario podía usarlo contra la red interna (SSRF). Además cualquiera podía dar de baja la suscripción de otro | Solo servicios push reales por HTTPS; la baja solo afecta a las propias; prueba §8 |
| 6 | `/uploads` era una carpeta pública | Quien tuviera el enlace de una foto la veía para siempre, sin sesión | Enlaces firmados que caducan, solo para quien puede ver la emergencia; pruebas `api` §17 y `security` §9 |
| 7 | Las fotos se guardaban en disco | En Render el disco se borra en cada reinicio (y el servicio se duerme): las fotos de la demo desaparecían | Se guardan en PostgreSQL; migración automática al arrancar |
| 8 | La pantalla **Configuración** guardaba valores que nada usaba | Cambiar el máximo de fotos, la prioridad del SOS o el centro del mapa no tenía efecto | Se aplican de inmediato y se validan por tipo y rango; prueba `api` §18 |
| 9 | Solo había correo por SMTP | Render bloquea el SMTP saliente: la recuperación de contraseña no llegaba | Brevo y Resend por API HTTP (sin dependencias nuevas) |
| 10 | El HTML de los correos no escapaba los nombres | Un nombre con etiquetas se inyectaba en el correo que reciben los contactos de confianza | Escapado en todas las plantillas |
| 11 | El enlace de recuperación se comprobaba y se marcaba por separado | Dos peticiones simultáneas podían usar el mismo enlace | Consumo atómico (`UPDATE … RETURNING`) |
| 12 | En producción sin `PUBLIC_URL` el arranque fallaba en silencio | El proceso quedaba vivo sin escuchar ningún puerto (en Render, un despliegue "colgado") | Sale con código 1 y un mensaje claro; en Render usa `RENDER_EXTERNAL_URL` |
| 13 | `make-cert.js` cargaba `selfsigned` en cada arranque | 6 segundos de espera al arrancar, y dependencia de una devDependency | Se carga solo al generar el certificado |
| 14 | `npm audit`: 5 vulnerabilidades moderadas | — | `qs`, `express` y `body-parser` actualizados; quedan 2 de `uuid` dentro de `exceljs` que no afectan (funciones que exceljs no usa) |
| 15 | El máximo de fotos contaba la nota de voz | Con nota de voz se podía adjuntar una foto menos | Solo cuentan las imágenes |
| 36 | Unas claves VAPID mal pegadas hacían fallar el arranque | Al activar el push en Render, el despliegue terminó con estado 1 (apareció después de la verificación) | El servidor arranca sin push y el log dice qué variable revisar; se limpian espacios y comillas |

### PWA y panel

| # | Fallo | Efecto | Corrección |
|---|-------|--------|------------|
| 16 | `offline.html` tenía el script en línea | La CSP lo bloqueaba: el botón *Reintentar* no hacía nada | Script en archivo propio |
| 17 | El service worker respondía `null` sin red ni copia | Nunca se mostraba la pantalla "Sin conexión", sino el error del navegador | La estrategia rechaza y cae en `offline.html` |
| 18 | Las páginas se guardaban con la query | `emergency.html?id=7` no encontraba la copia de `emergency.html` sin red | Clave por ruta, sin query |
| 19 | Sin red, fallaba la carga de Socket.IO y con ella el arranque de la pantalla | **El botón SOS no respondía** sin conexión | El tiempo real es opcional; la librería queda en caché |
| 20 | Con el GPS denegado el formulario exigía GPS | Callejón sin salida: ni el reporte ni el "SOS sin ubicación" se podían enviar | **Marcar en el mapa** (táctil y teclado); el operador ve que se marcó a mano |
| 21 | SOS sin conexión | Solo decía "no se pudo enviar" | Se guarda y se envía solo al volver la señal, y ofrece llamar al 123 |
| 22 | La cola sin conexión enviaba con la sesión abierta al volver la red | Si otra persona entraba en ese teléfono, el reporte quedaba a su nombre | Cada reporte guarda su autor y solo se envía con él |
| 23 | Al cerrar sesión quedaban en caché la API y las fotos | En un teléfono compartido, otro usuario podía verlas sin red | Se borran al cerrar sesión |
| 24 | El socket se rendía tras 10 reintentos | Si el servidor tardaba en volver (Render despertando), el panel dejaba de actualizarse hasta recargar | Reintentos sin límite, espaciados hasta 10 s |
| 25 | La URL de filtros salía con `??` | Al recargar o compartir se perdía el primer filtro | Corregido |
| 26 | `?next=/\otro-sitio.com` pasaba la comprobación | Redirección abierta después de iniciar sesión | Se compara el origen con `URL` |
| 27 | `?expired=1` no mostraba nada | El usuario volvía al login sin saber por qué | Aviso "Tu sesión expiró" |
| 28 | Los mapas no tenían contexto de apilamiento | Al hacer scroll, el mapa se dibujaba **encima** de la cabecera fija | `isolation: isolate` |
| 29 | Contraste insuficiente en casi todas las pantallas | Insignias ámbar a 1,9:1, textos grises a 2,6:1; en tema oscuro los enlaces (1,7:1) casi no se veían | Tokens de color para texto; 42/42 pantallas sin violaciones |
| 30 | Marcadores, `<select>` e interruptor sin nombre accesible; títulos de la PWA que no eran encabezados | Los lectores de pantalla no los anunciaban bien | Nombres y `<h1>` |
| 31 | Modales: el foco salía con Tab, no volvía al botón al cerrar y empezaba en la "×" | Con teclado se perdía el punto de la página | Foco retenido, devuelto al cerrar y puesto en el primer campo |
| 32 | Tablas del panel a 1366 px | Se cortaba la columna *Estado* del dashboard | Títulos en dos líneas y la hora en la línea secundaria en portátiles |
| 33 | El mapa del centro de control ignoraba el centro de Configuración | — | Lo usa |
| 34 | `/favicon.ico` daba 404 | Error en la consola en cada página | Redirige al icono |
| 35 | Configuración rechazaba un valor sin decir cuál | Mensaje genérico | Marca el campo inválido |
| 37 | Las teselas salían sin cabecera `Referer` (Helmet manda `no-referrer`) | En producción OpenStreetMap devolvía la imagen "403 Access blocked" en lugar del mapa, y el service worker la guardaba en caché | Las teselas envían solo el origen del sitio; URL recomendada `tile.openstreetmap.org`; caché v8; prueba de CSP en `security.test.js` |

También se corrigió la documentación: cifras desactualizadas del README (66
módulos, 2 disparadores, 19 HTML…), enlaces rotos a los entregables y las
variables de correo, que no figuraban en `backend/.env.example`.

---

## 5. Lo que queda por hacer a mano

Nada de esto se puede hacer desde el computador de desarrollo:

1. **Teléfono físico.** Con el servidor en HTTPS (`npm run cert` y
   `https://<IP-de-la-red>:4443/app/index.html`) o con el reenvío de puertos por
   USB (ver el README):
   - instalar la PWA y abrirla desde el ícono;
   - SOS con el GPS real (fijarse en la precisión que muestra);
   - negar el permiso de ubicación y enviar un reporte marcando en el mapa;
   - foto con la cámara trasera;
   - activar los avisos y pedir el envío de prueba;
   - modo avión: abrir la app, enviar un SOS y volver a activar la red.
2. **Lector de pantalla real**: NVDA en Windows sobre el panel y TalkBack en
   Android sobre la PWA. La auditoría automática no reemplaza esta prueba.
3. **Configuración de Render** (sección 6).

---

## 6. Despliegue en Render

Al subir esta versión, el servidor aplica solo la migración
`database/migrations/001-fotos-en-la-base.sql` en el primer arranque (no hace
falta consola ni volver a cargar el esquema; **no ejecutar `db:schema` en
Render**: borraría los datos).

Variables a revisar en *Environment*:

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `PUBLIC_URL` | No hace falta: se usa `RENDER_EXTERNAL_URL` |
| `CREDENTIALS_SHEET_ENABLED` | `false` (o sin definir: en producción ya es el valor por defecto) |
| `HTTPS_ENABLED` | Sin definir (en producción viene apagado) |
| `STORAGE_PROVIDER` | Sin definir (`database` por defecto) |
| `MAIL_PROVIDER` · `MAIL_API_KEY` · `MAIL_FROM` | `brevo`, la clave de la cuenta de Brevo y un remitente verificado en Brevo. La cuenta la crea el dueño del proyecto. |
| `PUSH_ENABLED` · `VAPID_*` | Las claves propias del proyecto, si se quiere push |

**Vigencia de la base gratuita.** Revisar en el panel de Render la fecha de
expiración de la base PostgreSQL gratuita: estas bases tienen una vida limitada
(la de este proyecto se creó el 7 de septiembre de 2026). Si vence antes de la
sustentación, se pierden los datos; conviene crear una nueva o exportar los
datos antes de esa fecha.

---

## 7. Cómo repetir las pruebas automáticas

```powershell
npm run db:up
npm run db:schema
npm run db:seed
npm run dev          # en otra terminal
npm run test:api
npm run test:realtime
npm run test:security
```
