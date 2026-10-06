import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { Api, apiErrorMessage } from '../../core/api';
import { HookLog } from '../../core/hook-log';
import { Emergency, PageMeta, PriorityCode, StatusCode } from '../../core/models';
import { EVENTS, Realtime } from '../../core/realtime';
import { ErsCard } from '../../shared/ers-card/ers-card';
import { EmergencyTable } from './emergency-table';

const PAGE_SIZE = 15;

/**
 * Lista de emergencias con filtros.
 *
 * Las emergencias que llegan por el socket se meten en el MISMO arreglo con
 * unshift()/splice(), a proposito: es lo que permite ver a ngDoCheck de
 * <ers-emergency-table> detectar un cambio que ngOnChanges no ve.
 */
@Component({
  selector: 'ers-emergencies',
  imports: [FormsModule, ErsCard, EmergencyTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './emergencies.html',
  styleUrl: './emergencies.css',
})
export class Emergencies implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  private readonly hooks = inject(HookLog);
  private readonly router = inject(Router);
  private subscription?: Subscription;

  /** Arreglo que se muta en vivo (ver comentario de la clase). */
  protected rows: Emergency[] = [];
  /** Cambios recibidos en vivo. Al cambiar, avisa a Angular que revise la vista. */
  protected readonly live = signal(0);
  protected readonly meta = signal<PageMeta | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected status: StatusCode | '' = '';
  protected priority: PriorityCode | '' = '';
  protected sosOnly = false;
  protected page = 1;

  protected readonly statuses: { code: StatusCode; label: string }[] = [
    { code: 'PENDIENTE', label: 'Pendiente' },
    { code: 'EN_PROCESO', label: 'En proceso' },
    { code: 'RESUELTO', label: 'Resuelto' },
    { code: 'CANCELADO', label: 'Cancelado' },
  ];
  protected readonly priorities: { code: PriorityCode; label: string }[] = [
    { code: 'CRITICA', label: 'Crítica' },
    { code: 'ALTA', label: 'Alta' },
    { code: 'MEDIA', label: 'Media' },
    { code: 'BAJA', label: 'Baja' },
  ];

  ngOnInit(): void {
    this.load();
    this.subscription = this.realtime
      .on<Emergency>(EVENTS.emergencyNew, EVENTS.emergencyStatus, EVENTS.emergencyAssigned)
      .subscribe(({ event, payload }) => this.receive(event === EVENTS.emergencyNew, payload));
    this.hooks.log('Emergencies', 'ngOnInit', 'primera página cargada y escuchando el socket');
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.hooks.log('Emergencies', 'ngOnDestroy', 'suscripción al socket cancelada');
  }

  protected applyFilters(): void {
    this.page = 1;
    this.load();
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected open(emergency: Emergency): void {
    void this.router.navigate(['/emergencias', emergency.id]);
  }

  private load(): void {
    this.loading.set(true);
    this.api
      .emergencies({
        page: this.page,
        limit: PAGE_SIZE,
        status: this.status,
        priority: this.priority,
        sos: this.sosOnly ? 'true' : undefined,
      })
      .subscribe({
        next: ({ items, meta }) => {
          this.rows = items; // arreglo nuevo: la tabla no lo cuenta como "llegada"
          this.meta.set(meta);
          this.error.set('');
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(apiErrorMessage(error, 'No se pudieron cargar las emergencias.'));
          this.loading.set(false);
        },
      });
  }

  /** Una emergencia llego o cambio por el socket. */
  private receive(isNew: boolean, emergency: Emergency): void {
    if (!this.matches(emergency)) return;

    const index = this.rows.findIndex((row) => row.id === emergency.id);
    if (index >= 0) {
      this.rows.splice(index, 1, { ...this.rows[index], ...emergency });
    } else if (isNew && this.page === 1) {
      this.rows.unshift(emergency);
      if (this.rows.length > PAGE_SIZE) this.rows.pop();
    } else {
      return;
    }
    this.live.update((v) => v + 1);
  }

  private matches(emergency: Emergency): boolean {
    if (this.status && emergency.status_code !== this.status) return false;
    if (this.priority && emergency.priority_code !== this.priority) return false;
    if (this.sosOnly && !emergency.is_sos) return false;
    return true;
  }
}
