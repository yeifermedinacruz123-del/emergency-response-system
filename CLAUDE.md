# CLAUDE.md — Emergency Response System (ERS)

Proyecto final de Web y Sistemas Moviles 2026-2, de Yeifer Medina. El `README.md`
describe **que** es el sistema; este archivo dice **como se trabaja en el** y
recoge las trampas que no son evidentes leyendo el codigo.

## Reglas duras

1. **El frontend es vanilla y no se negocia.** HTML + CSS + JS ES6 puro en
   `frontend/`. Sin React, Vue, Svelte, bundlers ni paso de build. Es requisito
   del curso. Las librerias de terceros (Leaflet, Chart.js) viven copiadas a
   mano en `frontend/vendor/`.
2. **No agregues dependencias** al backend sin que el usuario lo pida. El stack
   esta cerrado: express, pg, socket.io, jsonwebtoken, bcryptjs, helmet,
   express-rate-limit, express-validator, multer, nodemailer, exceljs, cors,
   compression, morgan, dotenv.
3. **Nada de secretos al repositorio.** `.env`, `backend/.env`,
   `usuarios-y-contrasenas.xlsx` y `backend/storage/credenciales/` estan en
   `.gitignore` y ahi se quedan. La hoja de accesos tiene contrasenas en texto
   plano a proposito: existe solo para la sustentacion.
4. **Los textos de cara al usuario y los comentarios van en espanol.** Es
   deliberado, no lo "arregles".

## Como se levanta

PostgreSQL esta instalado **via npm**, no con Docker ni con el instalador
oficial. Los datos viven fuera de OneDrive.

```bash
npm run db:up        # levanta Postgres local
npm run db:status    # comprobar que esta arriba
npm run dev          # servidor en http://localhost:4000
```

> **Trampa:** existe un `docker-compose.yml` en la raiz y scripts `docker:*` en
> el `package.json`. Son residuo de una etapa anterior. **Ignoralos.** Si algo
> sugiere levantar Postgres con Docker, esta mal.

> **Trampa:** la distribucion de Postgres instalada por npm **no trae `psql`**.
> Para SQL usa `npm run db:sql`, no el cliente de linea de comandos.

**No lances el servidor en segundo plano desde una sesion de Claude**: los
procesos en background no sobreviven entre turnos. Pidele al usuario que lo
corra el mismo en su terminal.

## Pruebas

No son unitarias: golpean el servidor **vivo** en `http://localhost:4000/api`.
Sin servidor arriba, fallan todas y el resultado no significa nada.

```bash
npm run test:api        # 1
npm run test:realtime   # 2
npm run test:security   # 3 -- SIEMPRE de ultimo
```

`security.test.js` agota a proposito el limitador de intentos de login y el
contador vive en memoria del proceso. Si corre antes que las otras, las
envenena y veras `429` por todos lados.

## Arquitectura del backend

```
routes/ -> controllers/ -> services/ -> models/
```

- La logica de negocio va en `services/`, no en los controladores.
- La validacion va en `validators/` con express-validator, no a mano.
- Los codigos de dominio (roles, estados, prioridades, transiciones) estan
  centralizados y congelados en `src/config/constants.js`. **Nunca escribas los
  literales sueltos**, usa `ROLES.*`, `EMERGENCY_STATUS.*`, etc.

### Roles: son cuatro

```
CIUDADANO -> PERSONAL -> OPERADOR -> ADMINISTRADOR
```

Coinciden con la columna `roles.code` de PostgreSQL. `PARAMEDICO`, `BOMBERO` y
`POLICIA` **no son roles**: son tipos de cuerpo de emergencia, otra constante
del mismo archivo.

En `services/credentials.service.js` aparece el literal `'ADMIN'`, pero es el
parametro `origin` (`'ADMIN' | 'SELF'`: quien fijo la contrasena). No tiene
relacion con los roles.

## Dos interfaces distintas

- `frontend/pages/` -> **panel web** del operador/administrador.
- `frontend/app/` -> **PWA del ciudadano**, instalable en movil.

Comparten poco codigo **a proposito**. Antes de diagnosticar un problema "del
movil", mira la URL: casi siempre es que se esta abriendo la interfaz
equivocada.

El service worker solo se registra en **contexto seguro**: `localhost` o HTTPS.
El navegador integrado no lo registra. Para probar la PWA en un telefono real
hace falta HTTPS (`npm run cert` + `HTTPS_ENABLED`) o un tunel.

## Despliegue

Esta desplegado en Render, con el repo en GitHub
(`yeifermedinacruz123-del/emergency-response-system`). Es plan gratuito: el
servicio se duerme por inactividad y el primer arranque tarda. No lo confundas
con un bug.

## Como trabaja el usuario

El proyecto se construyo en **18 fases**. La expectativa es **parar y reportar al
terminar cada fase**, no encadenar varias sin avisar.

## Agentes disponibles

- `qa-ers` — corre las tres suites en el orden correcto.
- `revisor-ers` — revisa el diff contra estas reglas antes de subir.
- `auditor-seguridad` — audita autenticacion, roles y datos de ciudadanos.
