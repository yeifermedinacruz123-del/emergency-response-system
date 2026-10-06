import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiEnvelope, LoginResult, RoleCode, User } from './models';

/**
 * Las mismas claves y el mismo formato (JSON) que usa el panel clasico en
 * frontend/js/core/config.js. Asi la sesion se comparte: quien ya entro al
 * panel entra directo al modulo Angular, y al reves.
 */
const KEYS = {
  access: 'ers.accessToken',
  refresh: 'ers.refreshToken',
  user: 'ers.user',
} as const;

/** El modulo Angular es del centro de control. */
export const CONTROL_ROOM: RoleCode[] = ['OPERADOR', 'ADMINISTRADOR'];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Modo privado o almacenamiento lleno: la sesion vive solo en memoria.
  }
}

@Injectable({ providedIn: 'root' })
export class Session {
  /*
   * HttpBackend salta los interceptores: el login y la renovacion del token no
   * pueden pasar por el interceptor que justamente depende del token.
   */
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);

  private readonly accessToken = signal<string | null>(read<string>(KEYS.access));
  private readonly refreshToken = signal<string | null>(read<string>(KEYS.refresh));
  readonly user = signal<User | null>(read<User>(KEYS.user));

  readonly isLoggedIn = computed(() => Boolean(this.accessToken() && this.user()));
  readonly isControlRoom = computed(() => {
    const role = this.user()?.role_code;
    return role !== undefined && CONTROL_ROOM.includes(role);
  });

  /** Una sola renovacion en vuelo aunque fallen varias peticiones a la vez. */
  private refreshing: Promise<string | null> | null = null;

  token(): string | null {
    return this.accessToken();
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<ApiEnvelope<LoginResult>>('/api/auth/login', { email, password })
    );
    const { user, accessToken, refreshToken } = response.data;

    // Se valida el rol ANTES de guardar nada: un ciudadano no debe quedar
    // con media sesion abierta en un modulo que no es para el.
    if (!CONTROL_ROOM.includes(user.role_code)) {
      throw new Error('Este modulo es para el centro de control (operadores y administradores).');
    }

    this.store(accessToken, refreshToken, user);
    return user;
  }

  /** Pide un token nuevo con el de renovacion. Devuelve null si ya no se puede. */
  refresh(): Promise<string | null> {
    const refreshToken = this.refreshToken();
    if (!refreshToken) return Promise.resolve(null);

    this.refreshing ??= firstValueFrom(
      this.http.post<ApiEnvelope<{ accessToken: string; refreshToken?: string }>>(
        '/api/auth/refresh',
        { refreshToken }
      )
    )
      .then((response) => {
        const { accessToken, refreshToken: rotated } = response.data;
        this.store(accessToken, rotated ?? refreshToken, this.user());
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        this.refreshing = null;
      });

    return this.refreshing;
  }

  async logout(): Promise<void> {
    const token = this.accessToken();
    if (token) {
      // Se avisa al servidor para que revoque el token de renovacion, pero
      // la sesion local se cierra aunque esa llamada falle.
      await firstValueFrom(
        this.http.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } })
      ).catch(() => undefined);
    }
    this.clear();
    await this.router.navigateByUrl('/login');
  }

  /** Cierra la sesion local sin llamar al servidor (token ya invalido). */
  expire(): void {
    this.clear();
    void this.router.navigate(['/login'], { queryParams: { expirada: 1 } });
  }

  private store(access: string | null, refresh: string | null, user: User | null): void {
    this.accessToken.set(access);
    this.refreshToken.set(refresh);
    this.user.set(user);
    write(KEYS.access, access);
    write(KEYS.refresh, refresh);
    write(KEYS.user, user);
  }

  private clear(): void {
    this.store(null, null, null);
  }
}
