import { Routes } from '@angular/router';

import { controlRoomGuard, guestGuard } from './core/auth';

/*
 * Cada pagina se carga perezosamente (loadComponent): el navegador solo baja
 * el codigo de una pantalla cuando se entra en ella.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Ingresar · ERS Angular',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [controlRoomGuard],
    loadComponent: () => import('./pages/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · ERS Angular',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'emergencias',
        title: 'Emergencias · ERS Angular',
        loadComponent: () => import('./pages/emergencies/emergencies').then((m) => m.Emergencies),
      },
      {
        path: 'emergencias/:id',
        title: 'Detalle · ERS Angular',
        loadComponent: () =>
          import('./pages/emergency-detail/emergency-detail').then((m) => m.EmergencyDetail),
      },
      {
        path: 'mapa',
        title: 'Mapa · ERS Angular',
        loadComponent: () => import('./pages/map-page/map-page').then((m) => m.MapPage),
      },
      {
        path: 'ciclos-de-vida',
        title: 'Ciclos de vida · ERS Angular',
        loadComponent: () =>
          import('./pages/lifecycle-lab/lifecycle-lab').then((m) => m.LifecycleLab),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
