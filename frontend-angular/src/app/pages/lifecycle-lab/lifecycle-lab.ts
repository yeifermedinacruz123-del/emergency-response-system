import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { HookLog } from '../../core/hook-log';
import { PriorityCode } from '../../core/models';
import { CardAction, ErsCard } from '../../shared/ers-card/ers-card';
import { HookTimeline } from '../../shared/hooks-panel/hooks-panel';
import { LabStage } from './lab-stage';

const PRIORITIES: PriorityCode[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const UNITS = ['UM-03', 'MB-02', 'PT-05', 'RS-02', 'UM-01', 'MB-01'];
const NOTES = [
  'Humo visible desde la Avenida 40.',
  'El ciudadano reporta personas atrapadas en el segundo piso.',
  'Bomberos confirman que el fuego está controlado.',
];

interface HookInfo {
  n: number;
  name: string;
  when: string;
  where: string;
  file: string;
}

/** Los 8 hooks y donde los usa de verdad el modulo. */
const HOOKS: HookInfo[] = [
  { n: 1, name: 'ngOnChanges', when: 'Antes de ngOnInit y cada vez que cambia un @Input.', where: 'KpiCard muestra cuánto subió un indicador; MapView redibuja los marcadores; EmergencyDetail cambia de sala cuando cambia el id de la ruta.', file: 'shared/kpi-card/kpi-card.ts' },
  { n: 2, name: 'ngOnInit', when: 'Una sola vez, después del primer ngOnChanges.', where: 'Shell abre el WebSocket; Dashboard, Emergencias y Mapa cargan datos de la API y se suscriben a los eventos.', file: 'pages/dashboard/dashboard.ts' },
  { n: 3, name: 'ngDoCheck', when: 'En cada detección de cambios.', where: 'EmergencyTable detecta con un IterableDiffer las filas que llegan por el socket al mismo arreglo.', file: 'pages/emergencies/emergency-table.ts' },
  { n: 4, name: 'ngAfterContentInit', when: 'Una sola vez, cuando existe el contenido proyectado.', where: 'ErsCard cuenta los botones que el padre le proyecta con ng-content.', file: 'shared/ers-card/ers-card.ts' },
  { n: 5, name: 'ngAfterContentChecked', when: 'Después de cada revisión del contenido proyectado.', where: 'ErsCard se entera cuando desaparecen los botones al cerrar una emergencia.', file: 'shared/ers-card/ers-card.ts' },
  { n: 6, name: 'ngAfterViewInit', when: 'Una sola vez, cuando la vista ya está en el DOM.', where: 'MapView crea el mapa Leaflet sobre el <div> que ya existe.', file: 'shared/map-view/map-view.ts' },
  { n: 7, name: 'ngAfterViewChecked', when: 'Después de cada revisión de la vista.', where: 'Chat baja el scroll al último mensaje cuando se pinta uno nuevo.', file: 'pages/emergency-detail/chat.ts' },
  { n: 8, name: 'ngOnDestroy', when: 'Justo antes de destruir el componente.', where: 'Shell cierra el socket; EmergencyDetail sale de la sala; MapView ejecuta map.remove(); las páginas cancelan sus suscripciones.', file: 'shared/map-view/map-view.ts' },
];

/**
 * Laboratorio de ciclos de vida. Cada boton provoca una situacion distinta y
 * el registro muestra, en orden, los hooks que Angular ejecuto por ella.
 */
@Component({
  selector: 'ers-lifecycle-lab',
  imports: [FormsModule, ErsCard, CardAction, LabStage, HookTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lifecycle-lab.html',
  styleUrl: './lifecycle-lab.css',
})
export class LifecycleLab {
  private readonly log = inject(HookLog);

  protected readonly hooks = HOOKS;
  protected readonly mounted = signal(true);
  protected readonly priority = signal<PriorityCode>('MEDIA');
  protected readonly note = signal(NOTES[0]);
  protected readonly tick = signal(0);
  protected readonly action = signal('Montar componente (al abrir la página)');
  /** Se muta con push() a proposito: ver "Asignar unidad". */
  protected readonly units: string[] = ['UM-03'];

  protected clearEachTime = true;

  protected toggleMount(): void {
    this.start(this.mounted() ? 'Desmontar componente' : 'Montar componente');
    this.mounted.update((value) => !value);
  }

  protected changePriority(): void {
    const next = PRIORITIES[(PRIORITIES.indexOf(this.priority()) + 1) % PRIORITIES.length];
    this.start(`Cambiar el @Input priority a ${next}`);
    this.priority.set(next);
  }

  protected addUnit(): void {
    const next = UNITS.find((unit) => !this.units.includes(unit));
    if (!next) return;
    this.start(`Asignar ${next} con push() al MISMO arreglo`);
    this.units.push(next);
    this.tick.update((value) => value + 1);
  }

  protected changeNote(): void {
    const next = NOTES[(NOTES.indexOf(this.note()) + 1) % NOTES.length];
    this.start('Cambiar el contenido proyectado (ng-content)');
    this.note.set(next);
  }

  protected internalEvent(): void {
    this.start('Evento interno del componente (+1 min)');
  }

  protected clear(): void {
    this.log.clear('lab');
  }

  private start(action: string): void {
    if (this.clearEachTime) this.log.clear('lab');
    this.action.set(action);
  }
}
