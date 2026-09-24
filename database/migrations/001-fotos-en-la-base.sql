-- =============================================================================
--  Migracion 001 - Fotografias y notas de voz guardadas en PostgreSQL
-- =============================================================================
--  Para bases creadas antes de esta version. schema.sql ya incluye estos
--  cambios, asi que una instalacion nueva no la necesita.
--
--  El backend la aplica SOLO al arrancar (database/index.js ->
--  applyMigrations), porque el plan gratuito de Render no tiene consola para
--  ejecutar SQL a mano. Por eso debe ser idempotente: se ejecuta en cada
--  arranque y la segunda vez no hace nada.
-- =============================================================================

ALTER TABLE photos ADD COLUMN IF NOT EXISTS content BYTEA;

CREATE INDEX IF NOT EXISTS idx_photos_file_name ON photos (file_name);

-- La opcion de push nacio cuando el envio dependia de Firebase y se sembro
-- apagada. Ahora el sistema la respeta de verdad (Web Push con claves VAPID),
-- asi que se enciende una sola vez: solo si conserva la descripcion antigua,
-- es decir, si nadie la cambio a mano desde el panel.
UPDATE system_settings
   SET value = 'true',
       description = 'Envio de notificaciones push (Web Push; requiere las claves VAPID del servidor).'
 WHERE key = 'notifications.push_enabled'
   AND description LIKE '%FCM%';
