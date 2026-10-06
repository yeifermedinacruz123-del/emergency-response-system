import { Injectable, signal } from '@angular/core';

export type HookName =
  | 'ngOnChanges'
  | 'ngOnInit'
  | 'ngDoCheck'
  | 'ngAfterContentInit'
  | 'ngAfterContentChecked'
  | 'ngAfterViewInit'
  | 'ngAfterViewChecked'
  | 'ngOnDestroy';

/** Orden oficial en que Angular llama a los hooks (1 a 8). */
export const HOOK_ORDER: HookName[] = [
  'ngOnChanges',
  'ngOnInit',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked',
  'ngOnDestroy',
];

export interface HookEvent {
  seq: number;
  at: Date;
  component: string;
  hook: HookName;
  detail: string;
  /** 'lab' = componente de prueba de la pagina Ciclos de vida; 'app' = el sistema real. */
  source: 'lab' | 'app';
}

const MAX_EVENTS = 200;

/**
 * Registro de los hooks que se van ejecutando, para verlos en pantalla.
 *
 * Los hooks corren DURANTE la deteccion de cambios. Si escribieran directo en
 * un signal que se pinta en la misma pantalla, cada escritura pediria otra
 * deteccion de cambios, que volveria a disparar ngDoCheck, que volveria a
 * escribir... un bucle. Por eso los eventos se acumulan en un arreglo normal
 * y se publican en el signal un instante despues, fuera del ciclo.
 */
@Injectable({ providedIn: 'root' })
export class HookLog {
  private seq = 0;
  private pending: HookEvent[] = [];
  private scheduled = false;

  readonly events = signal<HookEvent[]>([]);

  log(component: string, hook: HookName, detail = '', source: 'lab' | 'app' = 'app'): void {
    this.seq += 1;
    const event: HookEvent = { seq: this.seq, at: new Date(), component, hook, detail, source };
    this.pending.push(event);

    // Igual que la demo vista en clase: el orden tambien queda en la consola.
    console.log(`${HOOK_ORDER.indexOf(hook) + 1}. ${hook} · ${component}${detail ? ' · ' + detail : ''}`);

    if (!this.scheduled) {
      this.scheduled = true;
      setTimeout(() => this.flush());
    }
  }

  clear(source?: 'lab' | 'app'): void {
    this.pending = [];
    this.events.set(source ? this.events().filter((event) => event.source !== source) : []);
  }

  private flush(): void {
    this.scheduled = false;
    if (this.pending.length === 0) return;
    const next = [...this.pending.reverse(), ...this.events()].slice(0, MAX_EVENTS);
    this.pending = [];
    this.events.set(next);
  }
}
