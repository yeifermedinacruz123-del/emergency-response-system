import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import * as L from 'leaflet';

import { HookLog } from '../../core/hook-log';
import { MapMarker } from '../../core/models';

/** Villavicencio, por si la configuracion del servidor no llega. */
const FALLBACK_CENTER = { lat: 4.142, lng: -73.6266 };

/**
 * Mapa Leaflet + OpenStreetMap.
 *
 *  - ngAfterViewInit: Leaflet necesita un <div> que ya exista en el DOM. En el
 *    constructor o en ngOnInit el @ViewChild todavia no esta listo; despues de
 *    ngAfterViewInit si. Por eso el mapa se crea aqui y no antes.
 *  - ngOnChanges: el padre manda una lista nueva de marcadores (llego una
 *    emergencia, cambio un estado) y el mapa los redibuja sin recrearse.
 *  - ngOnDestroy: map.remove() suelta los eventos y las capas de Leaflet. Sin
 *    esto, cada vez que se entra y se sale del detalle quedaria un mapa
 *    huerfano ocupando memoria.
 */
@Component({
  selector: 'ers-map-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #container class="map" [style.height]="height" role="region" [attr.aria-label]="label"></div>`,
  styles: `
    :host { display: block; }
    .map {
      width: 100%;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-soft);
      isolation: isolate;
      background: var(--surface-sunken);
    }
  `,
})
export class MapView implements OnChanges, AfterViewInit, OnDestroy {
  private readonly hooks = inject(HookLog);

  @ViewChild('container', { static: true }) private container!: ElementRef<HTMLDivElement>;

  @Input() markers: MapMarker[] = [];
  @Input() center: { lat: number; lng: number } | null = null;
  @Input() zoom = 13;
  @Input() height = '420px';
  @Input() label = 'Mapa de emergencias';
  /** Ajustar la vista para que se vean todos los marcadores. */
  @Input() fit = true;
  /** Nombre que aparece en el registro de hooks. */
  @Input() trace = 'MapView';

  @Output() readonly markerClick = new EventEmitter<MapMarker>();

  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;
  /** Se encuadra una sola vez: despues se respeta el zoom que haya puesto el operador. */
  private framed = false;

  ngOnChanges(changes: SimpleChanges): void {
    // La primera vez el mapa aun no existe: ngAfterViewInit lo dibujara.
    if (!this.map || !changes['markers']) return;
    this.draw();
    this.hooks.log(this.trace, 'ngOnChanges', `${this.markers.length} marcadores redibujados`);
  }

  ngAfterViewInit(): void {
    const center = this.center ?? FALLBACK_CENTER;
    this.map = L.map(this.container.nativeElement, { zoomControl: true }).setView(
      [center.lat, center.lng],
      this.zoom
    );

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores de OpenStreetMap',
      // OpenStreetMap bloquea las teselas sin Referer (ver app.js del backend).
      referrerPolicy: 'strict-origin-when-cross-origin',
    } as L.TileLayerOptions).addTo(this.map);

    this.layer = L.layerGroup().addTo(this.map);
    this.draw();

    // El contenedor puede haber cambiado de tamaño mientras cargaba la pagina.
    setTimeout(() => this.map?.invalidateSize());
    this.hooks.log(this.trace, 'ngAfterViewInit', `mapa Leaflet creado con ${this.markers.length} marcadores`);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
    this.hooks.log(this.trace, 'ngOnDestroy', 'map.remove(): mapa y eventos liberados');
  }

  private draw(): void {
    if (!this.map || !this.layer) return;
    this.layer.clearLayers();

    for (const marker of this.markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;

      const isUnit = marker.kind === 'unit';
      const shape = L.circleMarker([marker.lat, marker.lng], {
        radius: isUnit ? 7 : marker.sos ? 11 : 9,
        color: isUnit ? marker.color : '#ffffff',
        weight: isUnit ? 3 : 2,
        fillColor: isUnit ? '#ffffff' : marker.color,
        fillOpacity: 0.95,
        className: marker.sos ? 'marker-sos' : '',
      });

      shape.bindTooltip(marker.title, { direction: 'top', offset: [0, -8] });
      shape.bindPopup(() => this.popup(marker));
      this.layer.addLayer(shape);
    }

    if (this.framed) return;
    this.framed = this.markers.length > 0;

    if (this.fit && this.markers.length > 1) {
      const bounds = L.latLngBounds(this.markers.map((m) => [m.lat, m.lng] as L.LatLngTuple));
      if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    } else if (this.markers.length === 1) {
      this.map.setView([this.markers[0].lat, this.markers[0].lng], Math.max(this.zoom, 15));
    }
  }

  /**
   * El contenido del popup se arma con textContent, nunca con HTML: los
   * titulos los escribe el ciudadano y podrian traer etiquetas.
   */
  private popup(marker: MapMarker): HTMLElement {
    const box = document.createElement('div');
    box.className = 'map-popup';

    const title = document.createElement('strong');
    title.textContent = marker.title;
    const subtitle = document.createElement('p');
    subtitle.textContent = marker.subtitle;
    box.append(title, subtitle);

    if (marker.kind === 'emergency') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--primary btn--sm';
      button.textContent = 'Ver detalle';
      button.addEventListener('click', () => this.markerClick.emit(marker));
      box.append(button);
    }
    return box;
  }
}
