import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

import { HookLog } from '../../core/hook-log';
import { Emergency } from '../../core/models';
import { EVENTS, Realtime } from '../../core/realtime';
import { Session } from '../../core/session';
import { HooksPanel } from '../../shared/hooks-panel/hooks-panel';

const STATE_LABEL = {
  'en-vivo': 'En vivo',
  conectando: 'Conectando…',
  reconectando: 'Reconectando…',
  desconectado: 'Sin conexión',
} as const;

/**
 * Armazon del modulo: cabecera, menu y el <router-outlet> donde cambian las
 * paginas. Vive mientras haya sesion, asi que es el dueño de la conexion.
 *
 *  - ngOnInit: abre el WebSocket una sola vez para todo el modulo.
 *  - ngOnDestroy: al cerrar sesion el armazon se destruye y cierra el socket.
 *    Si no, el servidor seguiria mandando eventos a alguien que ya salio.
 */
@Component({
  selector: 'ers-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HooksPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell implements OnInit, OnDestroy {
  private readonly realtime = inject(Realtime);
  private readonly hooks = inject(HookLog);
  protected readonly session = inject(Session);

  private sosSubscription?: Subscription;

  protected readonly connection = computed(() => this.realtime.state());
  protected readonly connectionLabel = computed(() => STATE_LABEL[this.realtime.state()]);
  protected readonly sos = signal<Emergency | null>(null);
  protected readonly dark = signal(document.documentElement.dataset['theme'] === 'dark');

  protected readonly links = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/emergencias', label: 'Emergencias' },
    { path: '/mapa', label: 'Mapa' },
    { path: '/ciclos-de-vida', label: 'Ciclos de vida' },
  ];

  ngOnInit(): void {
    this.realtime.connect();
    this.sosSubscription = this.realtime
      .on<Emergency>(EVENTS.sos)
      .subscribe(({ payload }) => this.sos.set(payload));
    this.hooks.log('Shell', 'ngOnInit', 'WebSocket abierto y escuchando SOS');
  }

  ngOnDestroy(): void {
    this.sosSubscription?.unsubscribe();
    this.realtime.disconnect();
    this.hooks.log('Shell', 'ngOnDestroy', 'WebSocket cerrado');
  }

  protected toggleTheme(): void {
    const next = this.dark() ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem('ers.theme', next);
    } catch {
      // Solo dura esta visita.
    }
    this.dark.set(next === 'dark');
  }

  protected dismissSos(): void {
    this.sos.set(null);
  }

  protected logout(): void {
    void this.session.logout();
  }
}
