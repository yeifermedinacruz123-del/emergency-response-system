/**
 * service-worker.js - Funcionamiento sin conexion de la PWA.
 *
 * Estrategias, y por que cada una:
 *
 *   Archivos de la aplicacion (HTML, CSS, JS, iconos, Leaflet)
 *     -> "stale while revalidate": se sirve la copia guardada al instante y se
 *        actualiza por detras. La app abre rapido incluso con mala señal, que
 *        es justo la situacion de una emergencia.
 *
 *   Peticiones a la API
 *     -> "network first": una emergencia mostrada con datos viejos seria
 *        peligrosa, asi que siempre se intenta la red. Solo si falla se
 *        devuelve la ultima respuesta guardada, marcada para que la interfaz
 *        pueda avisar de que no esta al dia.
 *
 *   Teselas del mapa
 *     -> "cache first" con limite: son inmutables y pesadas.
 *
 *   Peticiones que cambian datos (POST, PATCH, DELETE)
 *     -> nunca se guardan ni se responden desde la cache.
 *
 * IMPORTANTE: al cambiar cualquier archivo de PRECACHE hay que subir la
 * version de CACHE_VERSION. Si no, los navegadores seguirian sirviendo la
 * copia antigua.
 */

'use strict';

const CACHE_VERSION = 'v6';
const SHELL_CACHE = `ers-shell-${CACHE_VERSION}`;
const API_CACHE = `ers-api-${CACHE_VERSION}`;
const TILE_CACHE = `ers-tiles-${CACHE_VERSION}`;

/** Maximo de teselas guardadas, para no llenar el almacenamiento del telefono. */
const MAX_TILES = 300;

/** Archivos imprescindibles para que la app abra sin conexion. */
const PRECACHE = [
  '/app/index.html',
  '/app/report.html',
  '/app/my-emergencies.html',
  '/app/emergency.html',
  '/app/notifications.html',
  '/app/contacts.html',
  '/app/offline.html',
  '/login.html',
  '/register.html',
  '/manifest.json',

  '/css/reset.css',
  '/css/variables.css',
  '/css/global.css',
  '/css/components.css',
  '/css/forms.css',
  '/css/maps.css',
  '/css/mobile.css',

  '/js/core/theme-init.js',
  '/js/core/config.js',
  '/js/core/api.js',
  '/js/core/auth.js',
  '/js/core/utils.js',
  '/js/core/ui.js',
  '/js/core/socket.js',
  '/js/core/geo.js',
  '/js/components/map.js',
  '/js/mobile/app.js',
  '/js/mobile/home.js',
  '/js/mobile/seismic.js',
  '/js/mobile/report.js',
  '/js/mobile/my-emergencies.js',
  '/js/mobile/emergency.js',
  '/js/mobile/notifications.js',
  '/js/mobile/contacts.js',
  '/js/core/offlineQueue.js',
  '/js/pages/login.js',
  '/js/pages/register.js',

  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',

  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/favicon-32.png',
];

/* ==========================================================================
   Instalacion y activacion
   ========================================================================== */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) =>
        /*
         * addAll falla entero si UN archivo no existe, y eso dejaria la PWA
         * sin service worker. Se guardan de uno en uno para que un archivo
         * que falte no tumbe la instalacion completa.
         */
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch((error) => {
              console.warn('[SW] No se pudo guardar', url, error.message);
            })
          )
        )
      )
      // El service worker nuevo entra en servicio sin esperar a que se
      // cierren las pestañas abiertas.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const valid = [SHELL_CACHE, API_CACHE, TILE_CACHE];

  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('ers-') && !valid.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ==========================================================================
   Estrategias
   ========================================================================== */

/** Devuelve lo guardado al instante y actualiza por detras. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || network || fetch(request);
}

/**
 * Intenta la red y, si no hay, devuelve la ultima copia guardada.
 * La respuesta servida desde la cache lleva la cabecera X-Desde-Cache para
 * que el cliente pueda avisar de que los datos no estan al dia.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);

    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Desde-Cache', 'true');
      return new Response(await cached.blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    // Sin red y sin copia: se responde un JSON con la forma de la API para
    // que el cliente lo trate como cualquier otro error y no se rompa.
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Sin conexion. Comprueba tu red e intentalo de nuevo.',
        code: 'OFFLINE',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/** Sirve de la cache y, si no esta, la descarga y la guarda. */
async function cacheFirst(request, cacheName, { maxEntries = 0 } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      if (maxEntries > 0) trimCache(cacheName, maxEntries);
    }
    return response;
  } catch (error) {
    // Sin red y sin copia: una tesela en blanco, no una promesa rechazada.
    // Sin este catch, un fetch() que falla dentro del service worker se ve en
    // el navegador como "net::ERR_FAILED" en vez de como una imagen faltante.
    return new Response(null, { status: 504, statusText: 'Tile fetch failed' });
  }
}

/** Recorta una cache borrando las entradas mas antiguas. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  // Las claves salen en orden de insercion: se borran las primeras.
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

/* ==========================================================================
   Interceptor
   ========================================================================== */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo se gestiona GET: nunca se cachea ni se responde de cache un POST,
  // PATCH o DELETE, porque son acciones que deben llegar al servidor.
  if (request.method !== 'GET') return;

  // Socket.IO gestiona su propia conexion.
  if (url.pathname.startsWith('/socket.io/')) return;

  // Teselas del mapa (otro origen).
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(request, TILE_CACHE, { maxEntries: MAX_TILES }));
    return;
  }

  // Solo se toca el propio origen a partir de aqui.
  if (url.origin !== self.location.origin) return;

  // API.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Las fotografias subidas no cambian: se guardan al descargarlas.
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /*
   * Navegacion entre paginas. Si no hay red ni copia guardada, se muestra la
   * pagina de sin conexion en lugar del error del navegador.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      staleWhileRevalidate(request, SHELL_CACHE).catch(() =>
        caches.match('/app/offline.html')
      )
    );
    return;
  }

  // Resto de archivos de la aplicacion.
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

/* ==========================================================================
   Notificaciones push
   ========================================================================== */

/**
 * Preparado para la Fase 13 (Firebase Cloud Messaging).
 * El manejador ya funciona con cualquier push que llegue con este formato;
 * lo que falta es el servicio que las envie y las credenciales reales.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Emergency Response System', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Emergency Response System', {
      body: payload.body || payload.message || '',
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      tag: payload.tag || 'ers-notification',
      data: { url: payload.url || '/app/index.html' },
      vibrate: payload.urgent ? [200, 100, 200, 100, 200] : [100],
      requireInteraction: Boolean(payload.urgent),
    })
  );
});

/** Al tocar la notificacion se abre la pantalla correspondiente. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Si la app ya esta abierta se reutiliza esa ventana.
      const open = windows.find((client) => client.url.includes(self.location.origin));
      if (open) {
        open.navigate(target);
        return open.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

/** Permite que la pagina fuerce la activacion de una version nueva. */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
