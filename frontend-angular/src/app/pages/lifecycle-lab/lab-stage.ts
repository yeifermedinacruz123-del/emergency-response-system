import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { PriorityCode } from '../../core/models';
import { HookProbe } from './hook-probe';

/**
 * Escenario aislado donde vive <ers-hook-probe>.
 *
 * Es OnPush a proposito: solo se revisa cuando cambia alguna de sus entradas.
 * Asi, cuando el registro de hooks se repinta en la pagina, el componente de
 * prueba NO vuelve a ejecutar sus hooks (si lo hiciera, cada anotacion
 * provocaria otra revision y el registro nunca dejaria de crecer).
 */
@Component({
  selector: 'ers-lab-stage',
  imports: [HookProbe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mounted) {
      <ers-hook-probe [priority]="priority" [units]="units" (internal)="internal.emit()">{{ note }}</ers-hook-probe>
    } @else {
      <p class="empty">El componente está desmontado. Pulsa «Montar componente» para crearlo otra vez.</p>
    }
  `,
  styles: `
    .empty {
      margin: 0;
      padding: var(--space-6);
      border: 2px dashed var(--border-base);
      border-radius: var(--radius-lg);
      color: var(--text-muted);
      text-align: center;
    }
  `,
})
export class LabStage {
  @Input() mounted = true;
  @Input() priority: PriorityCode = 'MEDIA';
  @Input() units: string[] = [];
  @Input() note = '';
  /** Contador que la pagina sube para obligar a revisar el escenario. */
  @Input() tick = 0;
  @Output() readonly internal = new EventEmitter<void>();
}
