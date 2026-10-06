import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  ApiEnvelope,
  ChatMessage,
  DashboardCounters,
  Emergency,
  EmergencyDetail,
  MapData,
  Page,
  Responder,
  StatusCode,
} from './models';

type Query = Record<string, string | number | boolean | null | undefined>;

function toParams(query: Query = {}): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
  }
  return params;
}

/** Mensaje legible de un error de la API (la API responde { message, errors }). */
export function apiErrorMessage(error: unknown, fallback = 'No se pudo completar la accion.'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Sin conexion con el servidor.';
    const body = error.error as Partial<ApiEnvelope<unknown>> | null;
    const detail = body?.errors?.[0]?.message;
    return detail || body?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

/** Acceso tipado a la API REST del ERS. Siempre devuelve `data` ya desenvuelto. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(path: string, query?: Query): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(`/api${path}`, { params: toParams(query) })
      .pipe(map((response) => response.data));
  }

  private page<T>(path: string, query?: Query): Observable<Page<T>> {
    return this.http
      .get<ApiEnvelope<T[]>>(`/api${path}`, { params: toParams(query) })
      .pipe(map((response) => ({ items: response.data, meta: response.meta! })));
  }

  dashboard(): Observable<{ counters: DashboardCounters }> {
    return this.get('/statistics/dashboard');
  }

  emergencies(query: Query): Observable<Page<Emergency>> {
    return this.page('/emergencies', query);
  }

  emergency(id: number): Observable<EmergencyDetail> {
    return this.get(`/emergencies/${id}`);
  }

  map(): Observable<MapData> {
    return this.get('/emergencies/map');
  }

  responders(query: Query = {}): Observable<Page<Responder>> {
    return this.page('/responders', query);
  }

  availableResponders(): Observable<Responder[]> {
    return this.get('/responders/available');
  }

  messages(id: number): Observable<ChatMessage[]> {
    return this.get(`/emergencies/${id}/messages`);
  }

  sendMessage(id: number, message: string): Observable<ChatMessage> {
    return this.http
      .post<ApiEnvelope<ChatMessage>>(`/api/emergencies/${id}/messages`, { message })
      .pipe(map((response) => response.data));
  }

  changeStatus(id: number, status: StatusCode, extra: { notes?: string; reason?: string } = {}) {
    return this.http.patch<ApiEnvelope<EmergencyDetail>>(`/api/emergencies/${id}/status`, {
      status,
      ...extra,
    });
  }

  assign(id: number, responderIds: number[]) {
    return this.http.post<ApiEnvelope<unknown>>(`/api/emergencies/${id}/assign`, { responderIds });
  }
}
