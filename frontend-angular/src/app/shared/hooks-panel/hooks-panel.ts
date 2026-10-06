import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { formatTime } from '../../core/format';
import { HOOK_ORDER, HookLog, HookName } from '../../core/hook-log';

/**
 * Lista de hooks ejecutados. Se usa en dos sitios: como cajon flotante en todo
 * el modulo ("Hooks en vivo") y como linea de tiempo en la pagina Ciclos de vida.
 */
@Component({
  selector: 'ers-hook-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hook-timeline.html',
  styleUrl: './hook-timeline.css',
})
export class HookTimeline {
  private readonly log = inject(HookLog);

  readonly source = input<'lab' | 'app' | 'all'>('all');
  readonly limit = input(60);
  /** 'oldest' muestra el orden real de ejecucion (1, 2, 3...). */
  readonly order = input<'newest' | 'oldest'>('newest');

  protected readonly events = computed(() => {
    const source = this.source();
    const all = this.log.events();
    const list = (source === 'all' ? all : all.filter((event) => event.source === source)).slice(0, this.limit());
    return this.order() === 'oldest' ? [...list].reverse() : list;
  });

  protected step(hook: HookName): number {
    return HOOK_ORDER.indexOf(hook) + 1;
  }

  protected time(at: Date): string {
    return formatTime(at);
  }
}

/** Boton flotante que abre el registro de hooks del sistema real. */
@Component({
  selector: 'ers-hooks-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HookTimeline],
  templateUrl: './hooks-panel.html',
  styleUrl: './hooks-panel.css',
})
export class HooksPanel {
  private readonly log = inject(HookLog);

  protected readonly open = signal(false);
  protected readonly count = computed(() => this.log.events().filter((e) => e.source === 'app').length);

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected clear(): void {
    this.log.clear('app');
  }
}
