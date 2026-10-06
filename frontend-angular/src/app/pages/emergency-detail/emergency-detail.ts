import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription, debounceTime, filter } from 'rxjs';

import { Api, apiErrorMessage } from '../../core/api';
import { UNIT_TYPE, formatDateTime, timeAgo } from '../../core/format';
import { HookLog } from '../../core/hook-log';
import { ChatMessage, EmergencyDetail as Detail, MapMarker, Responder, StatusCode } from '../../core/models';
import { EVENTS, Realtime } from '../../core/realtime';
import { Session } from '../../core/session';
import { Badge } from '../../shared/badge/badge';
import { CardAction, ErsCard } from '../../shared/ers-card/ers-card';
import { MapView } from '../../shared/map-view/map-view';
import { Chat } from './chat';

type Panel = 'none' | 'assign' | 'cancel' | 'resolve';

/**
 * Detalle de una emergencia.
 *
 *  - ngOnChanges: el id llega desde la ruta (/emergencias/:id) como @Input.
 *    Si el operador pasa de una emergencia a otra, Angular REUTILIZA este
 *    componente y solo cambia el id: aqui se sale de la sala anterior y se
 *    carga la nueva.
 *  - ngOnInit: suscripcion a los eventos del socket, una sola vez.
 *  - ngOnDestroy: se sale de la sala de la emergencia en el servidor y se
 *    cancelan las suscripciones.
 */
@Component({
  selector: 'ers-emergency-detail',
  imports: [FormsModule, RouterLink, Badge, ErsCard, CardAction, MapView, Chat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './emergency-detail.html',
  styleUrl: './emergency-detail.css',
})
export class EmergencyDetail implements OnChanges, OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  private readonly hooks = inject(HookLog);
  private readonly router = inject(Router);
  protected readonly session = inject(Session);

  /** Parametro :id de la ruta (withComponentInputBinding). */
  @Input() id = '';

  private subscription = new Subscription();
  private emergencyId = 0;

  protected readonly emergency = signal<Detail | null>(null);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly units = signal<Responder[]>([]);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly panel = signal<Panel>('none');

  protected selectedUnits: number[] = [];
  protected reason = '';
  protected notes = '';

  /*
   * Cada recarga trae un objeto nuevo de la emergencia, pero el marcador solo
   * cambia si cambian su posicion, su color o el SOS. Con `equal`, el computed
   * conserva el arreglo anterior y el mapa no recibe un ngOnChanges inutil.
   */
  protected readonly markers = computed<MapMarker[]>(
    () => {
      const e = this.emergency();
      if (!e) return [];
      return [
        {
          id: e.id,
          kind: 'emergency',
          lat: Number(e.latitude),
          lng: Number(e.longitude),
          color: e.priority_color,
          title: `${e.code} · ${e.type_name}`,
          subtitle: e.address || e.zone_name || 'Ubicación por GPS',
          sos: e.is_sos,
        },
      ];
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  protected readonly formatDateTime = formatDateTime;
  protected readonly timeAgo = timeAgo;
  protected readonly unitType = UNIT_TYPE;

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['id'];
    if (!change) return;

    const next = Number(this.id);
    if (this.emergencyId) this.realtime.unfollow(this.emergencyId);
    this.emergencyId = next;
    this.panel.set('none');
    this.load();
    this.realtime.follow(next);

    this.hooks.log(
      'EmergencyDetail',
      'ngOnChanges',
      change.firstChange ? `id de la ruta: ${next}` : `id cambió ${change.previousValue} → ${next}: sale de una sala y entra a otra`
    );
  }

  ngOnInit(): void {
    this.subscription.add(
      this.realtime
        .on(EVENTS.emergencyStatus, EVENTS.emergencyUpdate, EVENTS.emergencyAssigned)
        .pipe(
          filter(({ payload }) => payload?.id === this.emergencyId),
          // Un cambio de estado llega como varios eventos: se recarga una vez.
          debounceTime(300)
        )
        .subscribe(() => this.load())
    );
    this.subscription.add(
      this.realtime.on<ChatMessage>(EVENTS.message).subscribe(({ payload }) => {
        if (payload?.emergency_id === this.emergencyId) this.addMessage(payload);
      })
    );
    this.hooks.log('EmergencyDetail', 'ngOnInit', `suscrito a la sala emergency:${this.emergencyId}`);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.realtime.unfollow(this.emergencyId);
    this.hooks.log('EmergencyDetail', 'ngOnDestroy', `salió de la sala emergency:${this.emergencyId}`);
  }

  protected openPanel(panel: Panel): void {
    this.panel.set(this.panel() === panel ? 'none' : panel);
    this.error.set('');
    if (panel === 'assign') {
      this.selectedUnits = [];
      this.api.availableResponders().subscribe({
        next: (units) => this.units.set(units),
        error: (error) => this.error.set(apiErrorMessage(error)),
      });
    }
  }

  protected toggleUnit(id: number, checked: boolean): void {
    this.selectedUnits = checked
      ? [...this.selectedUnits, id]
      : this.selectedUnits.filter((unit) => unit !== id);
  }

  protected setStatus(status: StatusCode): void {
    const extra =
      status === 'CANCELADO' ? { reason: this.reason.trim() } : status === 'RESUELTO' ? { notes: this.notes.trim() } : {};
    this.run(this.api.changeStatus(this.emergencyId, status, extra), 'Estado actualizado.');
  }

  protected assign(): void {
    if (this.selectedUnits.length === 0) {
      this.error.set('Elige al menos una unidad.');
      return;
    }
    this.run(this.api.assign(this.emergencyId, this.selectedUnits), 'Unidad asignada.');
  }

  protected sendMessage(text: string): void {
    this.busy.set(true);
    this.api.sendMessage(this.emergencyId, text).subscribe({
      next: (message) => {
        this.addMessage(message);
        this.busy.set(false);
      },
      error: (error) => {
        this.error.set(apiErrorMessage(error, 'No se pudo enviar el mensaje.'));
        this.busy.set(false);
      },
    });
  }

  protected back(): void {
    void this.router.navigateByUrl('/emergencias');
  }

  private run(request: Observable<unknown>, done: string): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.panel.set('none');
        this.reason = '';
        this.notes = '';
        this.notice.set(done);
        setTimeout(() => this.notice.set(''), 3000);
        this.load();
      },
      error: (error) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  private load(): void {
    const id = this.emergencyId;
    this.api.emergency(id).subscribe({
      next: (emergency) => {
        if (id !== this.emergencyId) return; // llego tarde: ya se cambio de emergencia
        this.emergency.set(emergency);
      },
      error: (error) => this.error.set(apiErrorMessage(error, 'No se pudo cargar la emergencia.')),
    });
    this.api.messages(id).subscribe({
      next: (messages) => {
        if (id === this.emergencyId) this.messages.set(messages);
      },
      error: () => this.messages.set([]),
    });
  }

  /** El mensaje propio llega dos veces (respuesta HTTP y socket): se agrega una. */
  private addMessage(message: ChatMessage): void {
    if (this.messages().some((m) => m.id === message.id)) return;
    this.messages.update((list) => [...list, message]);
  }
}
