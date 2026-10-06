import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  IterableDiffer,
  IterableDiffers,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';

import { timeAgo } from '../../core/format';
import { HookLog } from '../../core/hook-log';
import { Emergency } from '../../core/models';
import { Badge } from '../../shared/badge/badge';

/**
 * Tabla de emergencias.
 *
 * Hook: ngDoCheck. La pagina agrega las emergencias que llegan por el socket
 * con push()/splice() sobre el MISMO arreglo. Como la referencia no cambia,
 * ngOnChanges no se entera (solo compara referencias). ngDoCheck se ejecuta en
 * cada deteccion de cambios y aqui un IterableDiffer compara el contenido:
 * encuentra las filas nuevas o reemplazadas, las resalta y, como la tabla es
 * OnPush, pide a Angular que la vuelva a pintar con markForCheck().
 */
@Component({
  selector: 'ers-emergency-table',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './emergency-table.html',
  styleUrl: './emergency-table.css',
})
export class EmergencyTable implements DoCheck, OnDestroy {
  private readonly hooks = inject(HookLog);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly differ: IterableDiffer<Emergency> = inject(IterableDiffers)
    .find([])
    .create<Emergency>((_, item) => `${item.id}:${item.status_code}:${item.assignment_count}`);

  @Input({ required: true }) rows: Emergency[] = [];
  @Output() readonly select = new EventEmitter<Emergency>();

  /** Filas recien llegadas, resaltadas unos segundos. */
  protected readonly fresh = new Set<number>();
  /** Ultimo arreglo recibido: si llega otro (filtros, otra pagina) no es una fila "nueva". */
  private lastRows: Emergency[] | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  protected readonly timeAgo = timeAgo;

  ngDoCheck(): void {
    // Arreglo distinto = carga o recarga de la pagina, no llegadas en vivo.
    const replaced = this.rows !== this.lastRows;
    this.lastRows = this.rows;

    const changes = this.differ.diff(this.rows);
    if (!changes || replaced) return;

    const arrived: Emergency[] = [];
    changes.forEachAddedItem((record) => arrived.push(record.item));
    if (arrived.length === 0) return;

    for (const item of arrived) {
      this.fresh.add(item.id);
      this.timers.push(
        setTimeout(() => {
          this.fresh.delete(item.id);
          this.cdr.markForCheck();
        }, 4000)
      );
    }
    this.cdr.markForCheck();
    this.hooks.log(
      'EmergencyTable',
      'ngDoCheck',
      `detectó ${arrived.length} fila(s) nueva(s) o cambiada(s) en el mismo arreglo: ${arrived.map((e) => e.code).join(', ')}`
    );
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }
}
