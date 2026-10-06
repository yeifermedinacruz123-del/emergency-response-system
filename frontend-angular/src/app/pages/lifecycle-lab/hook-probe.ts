import {
  AfterContentChecked,
  AfterContentInit,
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  IterableDiffers,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';

import { HookLog, HookName } from '../../core/hook-log';
import { PriorityCode } from '../../core/models';
import { Badge } from '../../shared/badge/badge';

const PRIORITY_LABEL: Record<PriorityCode, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

/**
 * Componente de prueba que implementa los 8 hooks del ciclo de vida, como el
 * LifecycleDemo visto en clase, pero con forma de tarjeta de emergencia del ERS.
 * Cada hook se anota en el registro (y en la consola) en el orden en que
 * Angular lo llama.
 */
@Component({
  selector: 'ers-hook-probe',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hook-probe.html',
  styleUrl: './hook-probe.css',
})
export class HookProbe
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  private readonly log = inject(HookLog);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly unitsDiffer = inject(IterableDiffers).find([]).create<string>();
  private firstCheck = true;

  @Input() priority: PriorityCode = 'MEDIA';
  @Input() units: string[] = [];
  /** Avisa a la pagina antes de cambiar el estado interno (para limpiar el registro). */
  @Output() readonly internal = new EventEmitter<void>();

  protected minutes = 0;
  protected readonly priorityLabel = PRIORITY_LABEL;

  private note(hook: HookName, detail = ''): void {
    this.log.log('HookProbe', hook, detail, 'lab');
  }

  // 1. Antes de ngOnInit y cada vez que un @Input cambia de valor (referencia).
  ngOnChanges(changes: SimpleChanges): void {
    const detail = Object.entries(changes)
      .map(([name, change]) =>
        change.firstChange
          ? `${name} = ${JSON.stringify(change.currentValue)}`
          : `${name}: ${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.currentValue)}`
      )
      .join(' · ');
    this.note('ngOnChanges', detail);
  }

  // 2. Una sola vez, despues del primer ngOnChanges. Lugar para cargar datos.
  ngOnInit(): void {
    this.note('ngOnInit', 'una sola vez: aquí se cargarían los datos');
  }

  // 3. En cada deteccion de cambios. Aqui se detecta lo que ngOnChanges no ve:
  //    una unidad agregada al MISMO arreglo con push().
  ngDoCheck(): void {
    const changes = this.unitsDiffer.diff(this.units);
    const added: string[] = [];
    changes?.forEachAddedItem((record) => added.push(record.item));

    if (this.firstCheck) {
      this.firstCheck = false;
      this.note('ngDoCheck', 'primera revisión de cambios');
    } else if (added.length > 0) {
      // Como el componente es OnPush, hay que pedir que se vuelva a pintar.
      this.cdr.markForCheck();
      this.note('ngDoCheck', `el arreglo cambió por dentro (+${added.join(', ')}) y ngOnChanges no se enteró`);
    } else {
      this.note('ngDoCheck', 'revisión de cambios');
    }
  }

  // 4. Una sola vez, cuando el contenido proyectado (<ng-content>) ya existe.
  ngAfterContentInit(): void {
    this.note('ngAfterContentInit', 'la nota proyectada ya está disponible');
  }

  // 5. Despues de cada revision del contenido proyectado.
  ngAfterContentChecked(): void {
    this.note('ngAfterContentChecked', 'contenido proyectado revisado');
  }

  // 6. Una sola vez, cuando la vista propia y las hijas ya estan en el DOM.
  ngAfterViewInit(): void {
    this.note('ngAfterViewInit', 'la vista ya está en el DOM (aquí se crearía un mapa)');
  }

  // 7. Despues de cada revision de la vista.
  ngAfterViewChecked(): void {
    this.note('ngAfterViewChecked', 'vista revisada');
  }

  // 8. Justo antes de destruir el componente: limpiar sockets, timers, mapas.
  ngOnDestroy(): void {
    this.note('ngOnDestroy', 'componente destruido: se liberan recursos');
  }

  protected addMinute(): void {
    this.internal.emit();
    this.minutes += 1;
  }
}
