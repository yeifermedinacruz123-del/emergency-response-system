import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, debounceTime } from 'rxjs';

import { Api, apiErrorMessage } from '../../core/api';
import { UNIT_STATUS, UNIT_TYPE } from '../../core/format';
import { HookLog } from '../../core/hook-log';
import { MapData, MapMarker } from '../../core/models';
import { EVENTS, Realtime } from '../../core/realtime';
import { ErsCard } from '../../shared/ers-card/ers-card';
import { MapView } from '../../shared/map-view/map-view';

const UNIT_COLOR: Record<string, string> = {
  DISPONIBLE: '#15803d',
  OCUPADO: '#d97706',
  FUERA_DE_SERVICIO: '#64748b',
};

/**
 * Mapa general: emergencias activas y unidades.
 * Cada evento del socket trae un arreglo NUEVO de marcadores, asi que el
 * ngOnChanges de <ers-map-view> los redibuja sin recrear el mapa.
 */
@Component({
  selector: 'ers-map-page',
  imports: [ErsCard, MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-page.html',
  styleUrl: './map-page.css',
})
export class MapPage implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  private readonly hooks = inject(HookLog);
  private readonly router = inject(Router);
  private subscription?: Subscription;

  protected readonly data = signal<MapData | null>(null);
  protected readonly error = signal('');

  protected readonly markers = computed<MapMarker[]>(() => {
    const data = this.data();
    if (!data) return [];
    const emergencies: MapMarker[] = data.emergencies.map((e) => ({
      id: e.id,
      kind: 'emergency',
      lat: Number(e.latitude),
      lng: Number(e.longitude),
      color: e.priority_color,
      title: `${e.code} · ${e.type_name}`,
      subtitle: `${e.status_name} · prioridad ${e.priority_name.toLowerCase()} · ${e.zone_name || 'sin zona'}`,
      sos: e.is_sos,
    }));
    const units: MapMarker[] = data.responders
      .filter((r) => r.current_latitude !== null && r.current_longitude !== null)
      .map((r) => ({
        id: r.id,
        kind: 'unit',
        lat: Number(r.current_latitude),
        lng: Number(r.current_longitude),
        color: UNIT_COLOR[r.status] ?? '#64748b',
        title: `${r.unit_code} · ${r.unit_name}`,
        subtitle: `${UNIT_TYPE[r.responder_type] || r.responder_type} · ${UNIT_STATUS[r.status] || r.status}`,
      }));
    return [...emergencies, ...units];
  });

  protected readonly sosCount = computed(() => this.data()?.emergencies.filter((e) => e.is_sos).length ?? 0);

  ngOnInit(): void {
    this.load();
    this.subscription = this.realtime
      .on(EVENTS.emergencyNew, EVENTS.emergencyStatus, EVENTS.emergencyAssigned, EVENTS.responderStatus, EVENTS.responderLocation)
      .pipe(debounceTime(500))
      .subscribe(() => this.load());
    this.hooks.log('MapPage', 'ngOnInit', 'marcadores cargados y escuchando el socket');
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.hooks.log('MapPage', 'ngOnDestroy', 'suscripción al socket cancelada');
  }

  protected open(marker: MapMarker): void {
    void this.router.navigate(['/emergencias', marker.id]);
  }

  private load(): void {
    this.api.map().subscribe({
      next: (data) => {
        this.data.set(data);
        this.error.set('');
      },
      error: (error) => this.error.set(apiErrorMessage(error, 'No se pudo cargar el mapa.')),
    });
  }
}
