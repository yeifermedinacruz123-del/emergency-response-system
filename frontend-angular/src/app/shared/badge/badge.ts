import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const STATUS_CLASS: Record<string, string> = {
  PENDIENTE: 'pendiente',
  EN_PROCESO: 'proceso',
  RESUELTO: 'resuelto',
  CANCELADO: 'cancelado',
};

/** Etiqueta de estado o de prioridad, con los colores del sistema. */
@Component({
  selector: 'ers-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge--' + variant()">{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: 2px var(--space-2);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      white-space: nowrap;
      line-height: 1.6;
    }
    .badge--pendiente { background: var(--status-pendiente-bg); color: var(--status-pendiente-text); }
    .badge--proceso { background: var(--status-proceso-bg); color: var(--status-proceso-text); }
    .badge--resuelto { background: var(--status-resuelto-bg); color: var(--status-resuelto-text); }
    .badge--cancelado { background: var(--status-cancelado-bg); color: var(--status-cancelado-text); }
    .badge--baja { background: var(--priority-baja-bg); color: var(--priority-baja-text); }
    .badge--media { background: var(--priority-media-bg); color: var(--priority-media-text); }
    .badge--alta { background: var(--priority-alta-bg); color: var(--priority-alta-text); }
    .badge--critica { background: var(--priority-critica-bg); color: var(--priority-critica-text); }
    .badge--sos { background: var(--accent-500); color: var(--text-on-accent); letter-spacing: 0.04em; }
    .badge--neutral { background: var(--surface-sunken); color: var(--text-muted); }
  `,
})
export class Badge {
  readonly kind = input<'status' | 'priority' | 'sos' | 'neutral'>('neutral');
  readonly code = input<string>('');
  readonly label = input.required<string>();

  protected readonly variant = computed(() => {
    const kind = this.kind();
    if (kind === 'status') return STATUS_CLASS[this.code()] ?? 'neutral';
    if (kind === 'priority') return this.code().toLowerCase();
    return kind;
  });
}
