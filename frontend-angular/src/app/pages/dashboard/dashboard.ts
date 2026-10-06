import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription, debounceTime, forkJoin } from 'rxjs';

import { Api, apiErrorMessage } from '../../core/api';
import { UNIT_STATUS, UNIT_TYPE, formatTime, timeAgo } from '../../core/format';
import { HookLog } from '../../core/hook-log';
import { DashboardCounters, Emergency, Responder } from '../../core/models';
import { EVENTS, Realtime, RealtimeEvent } from '../../core/realtime';
import { Badge } from '../../shared/badge/badge';
import { CardAction, ErsCard } from '../../shared/ers-card/ers-card';
import { KpiCard } from '../../shared/kpi-card/kpi-card';

interface FeedItem {
  id: number;
  at: Date;
  text: string;
  sos: boolean;
}

const EVENT_TEXT: Partial<Record<RealtimeEvent, string>> = {
  [EVENTS.emergencyNew]: 'Nueva emergencia',
  [EVENTS.emergencyStatus]: 'Cambio de estado',
  [EVENTS.emergencyAssigned]: 'Unidad asignada',
  [EVENTS.emergencyUpdate]: 'Emergencia actualizada',
};

/**
 * Dashboard del centro de control.
 *
 *  - ngOnInit: primera carga de indicadores, emergencias y unidades, y
 *    suscripcion a los eventos del WebSocket.
 *  - ngOnDestroy: se cancela esa suscripcion. Sin esto, al ir a otra pagina
 *    el dashboard ya destruido seguiria recibiendo eventos y pidiendo datos.
 *
 * Los indicadores viajan a <ers-kpi-card>, que con su ngOnChanges muestra
 * cuanto cambio cada uno.
 */
@Component({
  selector: 'ers-dashboard',
  imports: [KpiCard, ErsCard, CardAction, Badge, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  private readonly hooks = inject(HookLog);
  private readonly router = inject(Router);

  private subscription = new Subscription();
  private feedSeq = 0;

  protected readonly counters = signal<DashboardCounters | null>(null);
  protected readonly active = signal<Emergency[]>([]);
  protected readonly units = signal<Responder[]>([]);
  protected readonly feed = signal<FeedItem[]>([]);
  protected readonly error = signal('');
  protected readonly loading = signal(true);

  protected readonly timeAgo = timeAgo;
  protected readonly formatTime = formatTime;
  protected readonly unitStatus = UNIT_STATUS;
  protected readonly unitType = UNIT_TYPE;

  ngOnInit(): void {
    this.load(true);

    const changes = this.realtime.on(
      EVENTS.emergencyNew,
      EVENTS.emergencyStatus,
      EVENTS.emergencyAssigned,
      EVENTS.emergencyUpdate,
      EVENTS.responderStatus,
      EVENTS.stats
    );

    // El registro de eventos se pinta al instante...
    this.subscription.add(changes.subscribe(({ event, payload }) => this.addToFeed(event, payload)));
    // ...pero la recarga se agrupa: una rafaga de eventos = una sola peticion.
    this.subscription.add(changes.pipe(debounceTime(400)).subscribe(() => this.load(false)));

    this.hooks.log('Dashboard', 'ngOnInit', 'datos cargados y suscrito a 6 eventos del socket');
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.hooks.log('Dashboard', 'ngOnDestroy', 'suscripciones del socket canceladas');
  }

  protected open(emergency: Emergency): void {
    void this.router.navigate(['/emergencias', emergency.id]);
  }

  private load(first: boolean): void {
    forkJoin({
      stats: this.api.dashboard(),
      active: this.api.emergencies({ active: 'true', limit: 8, sort: 'priority', order: 'desc' }),
      units: this.api.responders({ limit: 20, sort: 'status' }),
    }).subscribe({
      next: ({ stats, active, units }) => {
        this.counters.set(stats.counters);
        this.active.set(active.items);
        this.units.set(units.items);
        this.error.set('');
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        if (first) this.error.set(apiErrorMessage(error, 'No se pudo cargar el dashboard.'));
      },
    });
  }

  private addToFeed(event: RealtimeEvent, payload: Partial<Emergency> | undefined): void {
    const label = EVENT_TEXT[event];
    if (!label || !payload?.code) return;
    const status = payload.status_name ? ` · ${payload.status_name}` : '';
    this.feedSeq += 1;
    this.feed.update((items) =>
      [
        { id: this.feedSeq, at: new Date(), text: `${label}: ${payload.code}${status}`, sos: Boolean(payload.is_sos) },
        ...items,
      ].slice(0, 8)
    );
  }
}
