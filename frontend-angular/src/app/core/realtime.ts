import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { Socket, io } from 'socket.io-client';

import { Session } from './session';

/** Eventos que el servidor emite (backend/src/config/constants.js). */
export const EVENTS = {
  emergencyNew: 'emergency:new',
  emergencyUpdate: 'emergency:update',
  emergencyAssigned: 'emergency:assigned',
  emergencyStatus: 'emergency:status',
  sos: 'sos:activated',
  message: 'emergency:message',
  responderStatus: 'responder:status:update',
  responderLocation: 'responder:location:update',
  stats: 'stats:update',
} as const;

export type RealtimeEvent = (typeof EVENTS)[keyof typeof EVENTS];
export type ConnectionState = 'desconectado' | 'conectando' | 'en-vivo' | 'reconectando';

interface Incoming {
  event: RealtimeEvent;
  payload: any;
}

/**
 * Una sola conexion Socket.IO para todo el modulo. Los componentes no tocan el
 * socket: se suscriben con on() y cancelan la suscripcion en su ngOnDestroy.
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly session = inject(Session);
  private socket: Socket | null = null;
  /** Salas de emergencia abiertas, para volver a entrar tras una reconexion. */
  private readonly followed = new Set<number>();
  private readonly incoming = new Subject<Incoming>();

  readonly state = signal<ConnectionState>('desconectado');

  connect(): void {
    if (this.socket) return;
    this.state.set('conectando');

    const socket = io({
      // auth como funcion: en cada reconexion se toma el token vigente, no
      // el que habia cuando se abrio la conexion.
      auth: (send) => send({ token: this.session.token() }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      this.state.set('en-vivo');
      this.followed.forEach((id) => socket.emit('emergency:subscribe', id));
    });
    socket.on('disconnect', () => this.state.set('reconectando'));
    socket.on('connect_error', async (error) => {
      this.state.set('reconectando');
      // El token de acceso caduco: se renueva y se reintenta enseguida.
      if (/token|jwt|autentic/i.test(error.message)) {
        const fresh = await this.session.refresh();
        if (fresh) socket.connect();
        else this.session.expire();
      }
    });

    for (const event of Object.values(EVENTS)) {
      socket.on(event, (payload: unknown) => this.incoming.next({ event, payload }));
    }
    this.socket = socket;
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.followed.clear();
    this.state.set('desconectado');
  }

  /** Flujo de un evento (o varios). Quien se suscribe debe desuscribirse. */
  on<T = any>(...events: RealtimeEvent[]): Observable<{ event: RealtimeEvent; payload: T }> {
    return this.incoming.pipe(
      filter((item) => events.includes(item.event)),
      map((item) => item as { event: RealtimeEvent; payload: T })
    );
  }

  /** Entra a la sala de una emergencia (el servidor valida el permiso). */
  follow(emergencyId: number): void {
    this.followed.add(emergencyId);
    this.socket?.emit('emergency:subscribe', emergencyId);
  }

  unfollow(emergencyId: number): void {
    this.followed.delete(emergencyId);
    this.socket?.emit('emergency:unsubscribe', emergencyId);
  }
}
