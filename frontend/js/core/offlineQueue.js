/**
 * offlineQueue.js - Cola de reportes pendientes cuando no hay conexion.
 *
 * Por que IndexedDB y no localStorage: un reporte lleva fotos y audio, que son
 * archivos binarios (Blob). localStorage solo guarda texto; IndexedDB guarda
 * Blobs tal cual, sin convertirlos a base64 (un tercio mas grande y mas lento).
 *
 * Por que no la API real de Background Sync: no la soportan todos los
 * navegadores (Safari no la tiene), y pedirle permiso adicional a esta altura
 * del proyecto no compensa. En cambio, reintentar al volver la conexion
 * (evento "online") y al abrir la app cubre el mismo caso real -perder la
 * señal a mitad de un reporte- con codigo mucho mas simple y compatible.
 */

const DB_NAME = 'ers-offline';
const DB_VERSION = 1;
const STORE = 'pending-reports';

/** Abre (o crea) la base de datos. */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Ejecuta una transaccion y envuelve el resultado en una promesa. */
async function withStore(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = run(store);

    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Guarda un reporte para enviarlo mas tarde.
 * @param {object} fields  Campos de texto del formulario (type, title, etc).
 * @param {File[]} photos  Fotografias ya redimensionadas.
 * @param {Blob|null} audio  Nota de voz, si se grabo una.
 */
export async function queueReport(fields, photos, audio) {
  return withStore('readwrite', (store) =>
    store.add({ fields, photos, audio, createdAt: Date.now() })
  );
}

/** Todos los reportes pendientes, mas antiguos primero. */
export async function listQueuedReports() {
  const items = await withStore('readonly', (store) => store.getAll());
  return (items || []).sort((a, b) => a.createdAt - b.createdAt);
}

/** Cuantos reportes estan pendientes. Para el indicador de la pantalla de inicio. */
export async function countQueuedReports() {
  return withStore('readonly', (store) => store.count());
}

/** Quita un reporte ya enviado. */
export async function removeQueuedReport(id) {
  return withStore('readwrite', (store) => store.delete(id));
}
