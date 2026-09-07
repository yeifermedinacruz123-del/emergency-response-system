# Base de datos — Emergency Response System

Esta carpeta contiene todo lo relacionado con PostgreSQL.

| Archivo / carpeta | Contenido |
|-------------------|-----------|
| `schema.sql` | DDL completo: tablas, restricciones, indices, vistas y triggers. *(Fase 3)* |
| `seed.sql` | Datos de demostracion de Villavicencio. *(Fase 3)* |
| `migrations/` | Cambios incrementales del esquema, numerados. |
| `seeds/` | Conjuntos de datos adicionales. |
| `init/` | Se monta dentro del contenedor de PostgreSQL: los `.sql` que estén aquí se ejecutan **automáticamente** la primera vez que se crea el volumen. Solo aplica a la ruta con Docker. |

---

## Cómo se levanta PostgreSQL

### Opción A — sin instalar nada (la que usa este proyecto)

PostgreSQL 16 viene como dependencia de desarrollo del backend
(`embedded-postgres`). `npm install` descarga los binarios oficiales y el script
[`backend/scripts/db-local.js`](../backend/scripts/db-local.js) los controla con
`initdb` y `pg_ctl`.

```powershell
npm run db:up        # arranca (y crea el clúster la primera vez)
npm run db:status    # ¿está corriendo?
npm run db:sql       # consola SQL interactiva
npm run db:down      # detener
npm run db:reset     # BORRA los datos y empieza de cero
```

**Dónde viven los datos:** `%LOCALAPPDATA%\ers-postgres\data`, fuera de la
carpeta del proyecto. Es intencional: el proyecto está dentro de OneDrive, y
OneDrive sincronizando archivos mientras PostgreSQL los escribe puede corromper
la base de datos. Para cambiarlo, define `PGDATA_DIR` en `backend\.env`.

**Limitación conocida:** la distribución de `embedded-postgres` incluye
únicamente `initdb`, `pg_ctl` y `postgres`. **No trae los clientes `psql` ni
`createdb`.** Por eso todo lo que es "hablar SQL" (crear la base, la consola
interactiva, cargar los archivos `.sql`) se hace con el driver `pg` desde Node.

### Opción B — con Docker

```powershell
npm run docker:up      # crea la BD y ejecuta database/init/*.sql
npm run docker:down
```

pgAdmin queda en <http://localhost:5050> con las credenciales del `.env` raíz.

### Opción C — PostgreSQL instalado en Windows

```powershell
psql -U postgres -c "CREATE DATABASE ers_db;"
psql -U postgres -d ers_db -f database/schema.sql
psql -U postgres -d ers_db -f database/seed.sql
```

---

## Cómo se cargan el esquema y los datos

A partir de la **Fase 3**, y de forma independiente de la opción elegida:

```powershell
npm run db:schema    # crea tablas, índices, vistas y triggers
npm run db:seed      # inserta los datos de demostración
```

Ambos ejecutan `backend/scripts/run-sql.js`, que lee el archivo `.sql` y lo
envía por el driver `pg`. Así funcionan igual con o sin `psql` instalado.

> El esquema se crea en la **Fase 3**. Por ahora esta carpeta solo tiene la
> estructura y la base `ers_db` vacía.
