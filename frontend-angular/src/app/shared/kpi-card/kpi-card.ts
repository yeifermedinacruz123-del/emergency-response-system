import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';

import { HookLog } from '../../core/hook-log';

/**
 * Tarjeta de indicador del dashboard.
 *
 * Hook: ngOnChanges. Cuando el tiempo real cambia un contador, Angular entrega
 * el valor anterior y el nuevo en SimpleChanges. Con eso la tarjeta muestra la
 * diferencia (▲ +1) y se ilumina un momento, sin que el dashboard tenga que
 * recordar cuanto valia antes cada indicador.
 */
@Component({
  selector: 'ers-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.css',
})
export class KpiCard implements OnChanges, OnDestroy {
  private readonly hooks = inject(HookLog);
  private timer: ReturnType<typeof setTimeout> | undefined;

  @Input({ required: true }) label = '';
  @Input({ required: true }) value = 0;
  @Input() hint = '';
  @Input() tone: 'default' | 'danger' | 'warning' | 'info' | 'success' = 'default';
  /** En personal disponible subir es bueno; en emergencias activas, no. */
  @Input() upIsGood = false;

  protected readonly delta = signal(0);
  protected readonly pulsing = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['value'];
    // El primer cambio es la carga inicial: no hay "antes" con que comparar.
    if (!change || change.firstChange) return;

    const diff = Number(change.currentValue) - Number(change.previousValue);
    if (diff === 0) return;

    this.delta.set(diff);
    this.pulsing.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pulsing.set(false), 1600);

    this.hooks.log(
      `KpiCard "${this.label}"`,
      'ngOnChanges',
      `${change.previousValue} → ${change.currentValue} (${diff > 0 ? '+' : ''}${diff})`
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
