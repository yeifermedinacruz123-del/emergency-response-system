/**
 * map.js - Capa sobre Leaflet.
 *
 * Encapsula la creacion del mapa y de los marcadores para que las paginas no
 * repitan la configuracion de las teselas ni el HTML de cada icono.
 *
 * Por que marcadores dibujados con HTML (divIcon) y no imagenes: el color y el
 * icono de cada emergencia salen del catalogo de la base de datos (tipo,
 * prioridad, estado). Con PNG haria falta un archivo por cada combinacion y
 * cambiar un color obligaria a reexportar imagenes. Con divIcon basta con
 * pasar el color que ya viene en la respuesta de la API.
 *
 * Leaflet se carga desde /vendor/leaflet: no depende de ningun CDN, asi que el
 * sistema sigue funcionando aunque la red bloquee unpkg.
 */

import { CONFIG } from '../core/config.js';
import { escapeHtml, formatDateTime, timeAgo } from '../core/utils.js';

/** Leaflet expone L como variable global al cargarse. */
const L = window.L;

/** true si la libreria esta disponible. */
export function isLeafletReady() {
  return Boolean(window.L);
}

/* ==========================================================================
   Creacion del mapa
   ========================================================================== */

/**
 * Crea un mapa centrado en la ciudad configurada.
 *
 * @param {string} containerId Id del contenedor.
 * @param {object} [options]
 * @returns {object|null} La instancia de Leaflet, o null si no cargo.
 */
export function createMap(containerId, options = {}) {
  if (!isLeafletReady()) return null;

  const map = L.map(containerId, {
    center: options.center || CONFIG.map.center,
    zoom: options.zoom || CONFIG.map.zoom,
    minZoom: options.minZoom || CONFIG.map.minZoom,
    maxZoom: options.maxZoom || CONFIG.map.maxZoom,
    zoomControl: options.zoomControl !== false,
    scrollWheelZoom: options.scrollWheelZoom !== false,
    attributionControl: true,
    // La animacion de aparicion de teselas depende de requestAnimationFrame
    // y en algunos navegadores se queda pegada en opacidad 0 (tesela cargada
    // pero invisible). Desactivarla las deja visibles de inmediato.
    fadeAnimation: false,
  });

  L.tileLayer(CONFIG.map.tileUrl, {
    attribution: CONFIG.map.tileAttribution,
    maxZoom: CONFIG.map.maxZoom,
  }).addTo(map);

  return map;
}

/* ==========================================================================
   Marcadores
   ========================================================================== */

/**
 * Icono de una emergencia.
 * El color lo manda la prioridad (es lo que decide la urgencia) y el simbolo
 * el tipo (es lo que dice de que se trata).
 */
function emergencyIcon(emergency) {
  const isClosed = emergency.status_code === 'RESUELTO' || emergency.status_code === 'CANCELADO';

  const classes = [
    'marker',
    emergency.is_sos ? 'marker--sos' : '',
    isClosed ? 'marker--muted' : '',
  ].filter(Boolean).join(' ');

  return L.divIcon({
    className: 'marker-wrapper',
    html: `<div class="${classes}" style="--marker-color: ${escapeHtml(emergency.priority_color || '#274270')}">
             <span class="marker__icon" aria-hidden="true">${escapeHtml(emergency.type_icon || '⚠')}</span>
           </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

/** Icono de una unidad. El color lo da su disponibilidad. */
function unitIcon(unit) {
  const ICONS = {
    PARAMEDICO: '🚑',
    BOMBERO: '🚒',
    POLICIA: '🚓',
    RESCATISTA: '🧗',
  };

  return L.divIcon({
    className: 'marker-wrapper',
    html: `<div class="marker-unit" data-status="${escapeHtml(unit.status)}">
             ${ICONS[unit.responder_type] || '🚨'}
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

/**
 * Enlaces para navegar hasta un punto con la app de mapas del telefono.
 *
 * Son URLs "universales" documentadas por cada proveedor: si la app esta
 * instalada la abren directo con la ruta trazada, y si no caen a la version
 * web. No hace falta ninguna clave de API ni SDK de pago.
 */
export function directionsLinksHtml(lat, lng, { block = false } = {}) {
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
  const waze = `https://waze.com/ul?ll=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&navigate=yes`;
  const sizeClass = block ? 'btn--block' : 'btn--sm';

  return `
    <a href="${gmaps}" target="_blank" rel="noopener noreferrer" class="btn btn--primary ${sizeClass}">
      🧭 Como llegar
    </a>
    <a href="${waze}" target="_blank" rel="noopener noreferrer" class="btn btn--ghost ${sizeClass}">
      Waze ↗
    </a>`;
}

/** Contenido de la ventana emergente de una emergencia. */
function emergencyPopup(emergency, { detailUrl } = {}) {
  return `
    <div class="map-popup">
      <p class="map-popup__code">${escapeHtml(emergency.code)}</p>
      <p class="map-popup__title">${escapeHtml(emergency.title)}</p>

      <div class="map-popup__badges">
        ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
        <span class="badge badge--status" data-status="${escapeHtml(emergency.status_code)}">
          ${escapeHtml(emergency.status_name)}
        </span>
        <span class="badge badge--priority" data-priority="${escapeHtml(emergency.priority_code)}">
          ${escapeHtml(emergency.priority_name)}
        </span>
      </div>

      <p class="map-popup__meta">
        ${escapeHtml(emergency.type_name)}<br>
        ${escapeHtml(emergency.address || 'Sin direccion')}<br>
        ${escapeHtml(emergency.zone_name || 'Sin zona')} · ${escapeHtml(timeAgo(emergency.reported_at))}
        ${emergency.assignment_count > 0
          ? `<br>${emergency.assignment_count} unidad(es) asignada(s)`
          : '<br>Sin personal asignado'}
      </p>

      <div class="map-popup__actions">
        ${directionsLinksHtml(emergency.latitude, emergency.longitude)}
        ${detailUrl ? `<a href="${detailUrl}" class="btn btn--ghost btn--sm">Detalle</a>` : ''}
      </div>
    </div>`;
}

/** Contenido de la ventana emergente de una unidad. */
function unitPopup(unit) {
  return `
    <div class="map-popup">
      <p class="map-popup__code">${escapeHtml(unit.unit_code)}</p>
      <p class="map-popup__title">${escapeHtml(unit.full_name)}</p>

      <div class="map-popup__badges">
        <span class="badge badge--responder" data-status="${escapeHtml(unit.status)}">
          ${escapeHtml(unit.status.replace(/_/g, ' ').toLowerCase())}
        </span>
      </div>

      <p class="map-popup__meta">
        ${escapeHtml(unit.unit_name || unit.responder_type)}<br>
        ${escapeHtml(unit.institution || '')}<br>
        Posicion de ${escapeHtml(timeAgo(unit.location_updated_at))}
        ${unit.active_assignments > 0
          ? `<br>${unit.active_assignments} emergencia(s) en curso`
          : ''}
      </p>
    </div>`;
}

/* ==========================================================================
   Capas gestionadas
   ========================================================================== */

/**
 * Capa de marcadores que se puede refrescar entera o punto a punto.
 * Guarda los marcadores por id para poder mover una unidad sin volver a
 * dibujar el resto del mapa.
 */
export class MarkerLayer {
  constructor(map, { kind = 'emergency', detailUrlBuilder = null } = {}) {
    this.map = map;
    this.kind = kind;
    this.detailUrlBuilder = detailUrlBuilder;
    this.group = L.layerGroup().addTo(map);
    this.markers = new Map();
  }

  /** Reemplaza todos los marcadores por los de la lista. */
  setAll(items = []) {
    this.group.clearLayers();
    this.markers.clear();
    items.forEach((item) => this.upsert(item));
  }

  /** Añade o actualiza un marcador sin tocar los demas. */
  upsert(item) {
    if (item.latitude === null && item.current_latitude === null) return;

    const lat = Number(this.kind === 'unit' ? item.current_latitude : item.latitude);
    const lng = Number(this.kind === 'unit' ? item.current_longitude : item.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const existing = this.markers.get(item.id);

    // Si ya existe se mueve y se actualiza, en vez de borrarlo y recrearlo:
    // asi no parpadea ni se cierra su ventana emergente si estaba abierta.
    if (existing) {
      existing.setLatLng([lat, lng]);
      existing.setIcon(this.kind === 'unit' ? unitIcon(item) : emergencyIcon(item));
      existing.setPopupContent(this.buildPopup(item));
      return;
    }

    const marker = L.marker([lat, lng], {
      icon: this.kind === 'unit' ? unitIcon(item) : emergencyIcon(item),
      title: this.kind === 'unit' ? item.unit_code : item.title,
      riseOnHover: true,
      // Las SOS se dibujan por encima del resto.
      zIndexOffset: item.is_sos ? 1000 : 0,
    });

    marker.bindPopup(this.buildPopup(item));
    marker.addTo(this.group);
    this.markers.set(item.id, marker);
  }

  buildPopup(item) {
    if (this.kind === 'unit') return unitPopup(item);
    return emergencyPopup(item, {
      detailUrl: this.detailUrlBuilder ? this.detailUrlBuilder(item) : null,
    });
  }

  /** Quita un marcador. */
  remove(id) {
    const marker = this.markers.get(id);
    if (!marker) return;
    this.group.removeLayer(marker);
    this.markers.delete(id);
  }

  /** Abre la ventana emergente de un marcador y centra el mapa en el. */
  focus(id, zoom = 16) {
    const marker = this.markers.get(id);
    if (!marker) return false;

    this.map.setView(marker.getLatLng(), zoom, { animate: true });
    marker.openPopup();
    return true;
  }

  /** Muestra u oculta toda la capa. */
  setVisible(visible) {
    if (visible) this.map.addLayer(this.group);
    else this.map.removeLayer(this.group);
  }

  get size() {
    return this.markers.size;
  }
}

/* ==========================================================================
   Mapa de calor
   ========================================================================== */

/** true si el plugin Leaflet.heat (vendorizado junto a Leaflet) esta cargado. */
export function isHeatReady() {
  return Boolean(window.L && typeof window.L.heatLayer === 'function');
}

/**
 * Capa de calor a partir de emergencias con coordenadas.
 * El peso de cada punto sube con la prioridad, para que una zona con
 * incidentes criticos se note mas que una con el mismo numero de incidentes
 * de baja prioridad.
 */
export function createHeatLayer(emergencies = []) {
  if (!isHeatReady()) return null;

  const WEIGHT_BY_LEVEL = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1 };

  const points = emergencies
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .map((item) => [
      Number(item.latitude),
      Number(item.longitude),
      WEIGHT_BY_LEVEL[item.priority_level] || 0.6,
    ]);

  // "max" es el valor de intensidad que se pinta a rojo pleno. Leaflet.heat
  // ademas reduce el peso de cada punto cuanto mas alejado esta el zoom
  // actual de "maxZoom" (piensa en zoom de ciudad, no de calle): con pocos
  // incidentes de prueba y un max por defecto de 1, el resultado era casi
  // invisible. Un max bajo hace que el mismo dato se note en la demo.
  return L.heatLayer(points, { radius: 32, blur: 24, maxZoom: 15, max: 0.25 });
}

/**
 * Ajusta el mapa para que se vean todos los puntos.
 * Si no hay ninguno, se queda en el centro configurado en lugar de saltar a
 * una vista del mundo entero.
 */
export function fitToMarkers(map, layers = [], { maxZoom = 15 } = {}) {
  const points = [];

  layers.forEach((layer) => {
    layer.markers.forEach((marker) => points.push(marker.getLatLng()));
  });

  if (points.length === 0) {
    map.setView(CONFIG.map.center, CONFIG.map.zoom);
    return;
  }

  map.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom });
}

/**
 * Mapa pequeño de solo lectura con un unico punto.
 * Se usa en el detalle de una emergencia.
 */
export function createMiniMap(containerId, latitude, longitude, emergency = null) {
  if (!isLeafletReady()) return null;

  const map = L.map(containerId, {
    center: [Number(latitude), Number(longitude)],
    zoom: 16,
    zoomControl: true,
    scrollWheelZoom: false, // no robar el scroll de la pagina
    dragging: true,
    fadeAnimation: false, // ver comentario en createMap()
  });

  L.tileLayer(CONFIG.map.tileUrl, {
    attribution: CONFIG.map.tileAttribution,
    maxZoom: CONFIG.map.maxZoom,
  }).addTo(map);

  const marker = L.marker([Number(latitude), Number(longitude)], {
    icon: emergency ? emergencyIcon(emergency) : undefined,
  }).addTo(map);

  if (emergency) marker.bindPopup(emergencyPopup(emergency));

  return map;
}

export default {
  createMap, createMiniMap, MarkerLayer, fitToMarkers, isLeafletReady,
  createHeatLayer, isHeatReady,
};
