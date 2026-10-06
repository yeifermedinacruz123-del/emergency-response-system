import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Session } from './session';

const user = (role: string) => ({ id: 1, full_name: 'Prueba', role_code: role, role_name: role });

describe('Session', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('lee la sesión que dejó el panel clásico (mismas claves, en JSON)', () => {
    localStorage.setItem('ers.accessToken', JSON.stringify('token-del-panel'));
    localStorage.setItem('ers.user', JSON.stringify(user('OPERADOR')));

    const session = TestBed.inject(Session);

    expect(session.token()).toBe('token-del-panel');
    expect(session.isControlRoom()).toBe(true);
  });

  it('no deja entrar a un ciudadano ni guarda su sesión', async () => {
    const session = TestBed.inject(Session);
    const http = TestBed.inject(HttpTestingController);

    const attempt = session.login('maria@example.com', 'secreta');
    http.expectOne('/api/auth/login').flush({
      success: true,
      message: 'ok',
      data: { user: user('CIUDADANO'), accessToken: 'a', refreshToken: 'r' },
    });

    await expect(attempt).rejects.toThrow('centro de control');
    expect(localStorage.getItem('ers.accessToken')).toBeNull();
  });
});
