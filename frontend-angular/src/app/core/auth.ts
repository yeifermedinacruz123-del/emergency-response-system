import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { Session } from './session';

const withToken = (request: HttpRequest<unknown>, token: string | null) =>
  token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

/**
 * Pone el token en cada peticion a la API y, si el servidor responde 401
 * porque caduco (dura 15 minutos), lo renueva una vez y repite la peticion.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  if (!request.url.startsWith('/api/')) return next(request);

  return next(withToken(request, session.token())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(session.refresh()).pipe(
        switchMap((fresh) => {
          if (!fresh) {
            session.expire();
            return throwError(() => error);
          }
          return next(withToken(request, fresh));
        })
      );
    })
  );
};

/** Solo entra quien tiene sesion de operador o administrador. */
export const controlRoomGuard: CanActivateFn = () => {
  const session = inject(Session);
  if (session.isLoggedIn() && session.isControlRoom()) return true;
  return inject(Router).createUrlTree(['/login']);
};

/** Al login no se vuelve con la sesion abierta. */
export const guestGuard: CanActivateFn = () => {
  const session = inject(Session);
  if (session.isLoggedIn() && session.isControlRoom()) {
    return inject(Router).createUrlTree(['/dashboard']);
  }
  return true;
};
