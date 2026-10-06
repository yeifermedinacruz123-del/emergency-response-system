import {
  AfterContentChecked,
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Directive,
  Input,
  QueryList,
  inject,
  signal,
} from '@angular/core';

import { HookLog } from '../../core/hook-log';

/** Marca un boton como accion de la tarjeta: <button card-action>…</button> */
@Directive({ selector: '[card-action]' })
export class CardAction {}

/**
 * Tarjeta contenedora del panel. Lo que se pone dentro llega por <ng-content>
 * (contenido proyectado): el cuerpo, y aparte los botones marcados con
 * card-action, que van en la cabecera.
 *
 * Hooks de contenido:
 *  - ngAfterContentInit: la primera vez que el contenido proyectado existe.
 *    Aqui se cuentan los botones para saber si hay que reservar la barra de
 *    acciones. Antes de este hook la QueryList todavia esta vacia.
 *  - ngAfterContentChecked: despues de cada revision del contenido. Si el
 *    padre quita o agrega botones (por ejemplo, al resolver una emergencia
 *    desaparecen "Resolver" y "Asignar"), la tarjeta se entera aqui.
 */
@Component({
  selector: 'ers-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ers-card.html',
  styleUrl: './ers-card.css',
})
export class ErsCard implements AfterContentInit, AfterContentChecked {
  private readonly hooks = inject(HookLog);

  @Input() heading = '';
  @Input() subheading = '';
  /** Nombre que aparece en el registro de hooks. */
  @Input() trace = '';

  @ContentChildren(CardAction, { descendants: true }) private actions!: QueryList<CardAction>;

  protected readonly actionCount = signal(0);

  ngAfterContentInit(): void {
    this.actionCount.set(this.actions.length);
    if (this.trace) {
      this.hooks.log(`ErsCard "${this.trace}"`, 'ngAfterContentInit', `${this.actions.length} acciones proyectadas`);
    }
  }

  ngAfterContentChecked(): void {
    // Se ejecuta en cada deteccion de cambios: solo se registra si cambio algo.
    const count = this.actions.length;
    if (count === this.actionCount()) return;
    this.actionCount.set(count);
    if (this.trace) {
      this.hooks.log(`ErsCard "${this.trace}"`, 'ngAfterContentChecked', `ahora tiene ${count} acciones`);
    }
  }
}
