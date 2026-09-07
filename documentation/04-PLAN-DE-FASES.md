# 04 — Plan de Desarrollo por Fases

> **Estado: las 18 fases completadas.**
> Documento actualizado al cierre del desarrollo.

| Fase | Nombre | Entregable | Estado |
|:----:|--------|------------|:------:|
| 1 | Análisis y arquitectura | `documentation/01..05` | ✅ |
| 2 | Estructura del proyecto | Carpetas, `package.json`, servidor base | ✅ |
| 3 | Base de datos | `schema.sql` (17 tablas, 4 vistas, 2 disparadores) + `seed.sql` | ✅ |
| 4 | Backend y API REST | 66 módulos en 5 capas, ~50 endpoints | ✅ |
| 5 | Autenticación y roles | JWT con rotación, bcrypt, autorización en 3 niveles | ✅ |
| 6 | Módulo de emergencias | Ciclo de vida, asignaciones, bitácora | ✅ |
| 7 | Socket.IO | 10 eventos, 4 tipos de sala, autenticación en el handshake | ✅ |
| 8 | Frontend web | 7 pantallas del panel, sin frameworks | ✅ |
| 9 | Mapas | Leaflet + OpenStreetMap, marcadores por prioridad y tipo | ✅ |
| 10 | PWA | `manifest.json`, service worker, iconos generados | ✅ |
| 11 | GPS y SOS | Geolocation API, pulsación sostenida de 2 s | ✅ |
| 12 | Fotografías | Cámara y galería, redimensionado en el navegador | ✅ |
| 13 | Notificaciones | Bandeja + Socket.IO + Web Push con claves propias | ✅ |
| 14 | Estadísticas | 7 gráficos Chart.js + comparación con objetivos | ✅ |
| 15 | Seguridad | Auditoría completa; una vulnerabilidad real corregida | ✅ |
| 16 | Pruebas | 182 comprobaciones automatizadas en 3 suites | ✅ |
| 17 | Corrección | 6 defectos encontrados y cerrados | ✅ |
| 18 | Documentación final | README, manual de usuario, documentos técnicos | ✅ |

---

## Criterio de verificación al cerrar cada fase

Se aplicó el mismo criterio en las 18 fases, y fue deliberadamente estricto:

1. `node --check` sobre cada archivo JavaScript nuevo o modificado.
2. Carga real del árbol de módulos, para detectar imports rotos.
3. **Arranque del servidor y ejercicio de la funcionalidad en ejecución.**
4. Revisión de la interfaz en escritorio y en resolución de teléfono.
5. No se avanza de fase con errores conocidos abiertos.

El punto 3 es el que marcó la diferencia. **Los seis defectos que se
encontraron durante el desarrollo compartían una característica: ninguno era
visible leyendo el código.**

---

## Defectos encontrados y corregidos

| Fase | Defecto | Causa |
|:----:|---------|-------|
| 2 | El error de conexión a la base llegaba vacío | Node agrupa los intentos IPv4/IPv6 en un `AggregateError` sin mensaje |
| 4 | Dos tokens de sesión idénticos | Renovar dentro del mismo segundo producía el mismo JWT; chocaba con el índice único |
| 7 | El servidor no se apagaba | Las conexiones de Socket.IO abiertas impedían que `server.close()` terminara |
| 8 | El atributo `hidden` no ocultaba nada | Una regla CSS posterior con `display` tenía precedencia |
| 15 | **El limitador de intentos se podía burlar** | `trust proxy` fijo en 1 sin proxy real: la IP se podía falsear con `X-Forwarded-For` |
| 15 | Escapado inconsistente en atributos `style` | Los valores de catálogo se insertaban sin escapar en el mapa |

El de la fase 15 es el más serio: dejaba el control de fuerza bruta sin efecto.
Se comprobó explotable antes de corregirlo y se verificó cerrado después, con
la prueba incorporada de forma permanente a `tests/security.test.js`.

---

## Revisión posterior al cierre: cuatro enlaces sin destino

Al recorrer el sistema pantalla por pantalla, ya cerradas las 18 fases,
aparecieron **cuatro enlaces que llevaban a un 404 en JSON**. El menú y la
campana los ofrecían, la API que necesitaban existía y funcionaba, pero la
página HTML no se había escrito nunca.

| Enlace | Desde dónde | Rol afectado |
|--------|-------------|--------------|
| `/pages/notifications.html` | Campana de la navbar y menú "Sistema" | Todos |
| `/pages/audit.html` | Menú "Sistema" → Auditoría | Administrador |
| `/pages/settings.html` | Menú "Sistema" → Configuración | Administrador |
| `/register.html` | "Regístrate como ciudadano", en el acceso | Público |

**Por qué no lo detectó ninguna de las 181 pruebas:** las tres suites prueban
la API, los sockets y la seguridad, es decir el backend. Ninguna pide páginas
HTML, así que un enlace roto en el menú era invisible para todas ellas. El
error tampoco se ve leyendo el código: `ROUTES.audit` existe y apunta a una
cadena correcta; lo que falta es el archivo al otro lado.

Las cuatro páginas se escribieron contra los endpoints que ya existían, sin
tocar el backend. Se aprovechó para retirar de la pantalla de acceso el bloque
de usuarios de demostración, que enseñaba correos y contraseñas válidos a
cualquiera que abriera la página.

### La PWA no se podía usar en un teléfono

Al probarla en un móvil real apareció un séptimo defecto, y era el más
incapacitante de todos: **la aplicación salía sin ningún estilo**, con la letra
serif por defecto del navegador y los enlaces azules subrayados.

La causa estaba en la cabecera `Content-Security-Policy`. Helmet incluye por
defecto la directiva `upgrade-insecure-requests`, que ordena al navegador pedir
por `https://` todos los subrecursos de la página. Contra este servidor, que
habla HTTP, cada hoja de estilo y cada módulo moría con
`ERR_SSL_PROTOCOL_ERROR`: siete peticiones fallidas y una página en crudo.

**Por qué no se había visto nunca:** los navegadores eximen de esa reescritura
a los orígenes de confianza, y `localhost` es uno de ellos. Todo el desarrollo
y las 181 pruebas corrían por `localhost`, donde la directiva no hace nada. El
fallo solo se manifestaba entrando por la IP de la red local, que es
precisamente el único modo de abrir la PWA en un teléfono sin cable.

La directiva se mantiene en producción, donde el servidor sí va detrás de
HTTPS y es lo correcto. Se añadió a `tests/security.test.js` una comprobación
permanente de que en desarrollo no aparece, con lo que la suite pasa de 40 a
41 casos y el total a 182.

---

## Orden de dependencias

```text
Fase 1 ─► Fase 2 ─► Fase 3 ─► Fase 4 ─► Fase 5 ─┬─► Fase 6 ─► Fase 7
                                                 │
                                                 └─► Fase 8 ─► Fase 9 ─► 10 ─► 11 ─► 12
                                                                                      │
                          Fase 13 ─► Fase 14 ─► Fase 15 ─► Fase 16 ─► Fase 17 ─► 18 ◄─┘
```

La base de datos fue la primera dependencia real: sin `schema.sql` no hay
modelos, y sin modelos no hay API. Por eso las fases 3 y 4 se ejecutaron
juntas: un backend sin tablas no arranca ni se puede probar.

Las fases 10, 11 y 12 también se ejecutaron juntas, por el motivo contrario:
separarlas habría dejado una aplicación móvil con botones sin función, lo que
contradice las reglas de calidad del proyecto.

---

## Lo que queda fuera del alcance

Documentado para que no se lea como algo pendiente por olvido:

- **Integración con el NUSE 123.** Requiere convenio institucional.
- **Despliegue en producción.** El sistema corre en entorno de desarrollo.
- **Aplicaciones nativas Android/iOS.** Se optó por PWA a propósito.
- **Entrega de push verificada en un dispositivo físico.** El servidor está
  verificado; falta la prueba de extremo a extremo con un teléfono real, que
  requiere HTTPS o redirección de puertos por USB.
- **Fotografías tras autenticación.** Hoy se sirven por URL con nombre
  aleatorio. Para producción harían falta URLs firmadas.
