import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/*
 * Mismo tema que el panel clasico (frontend/js/core/theme-init.js). Se aplica
 * antes de arrancar Angular para que no parpadee en claro al cargar.
 */
try {
  const saved = localStorage.getItem('ers.theme');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset['theme'] = saved || (dark ? 'dark' : 'light');
} catch {
  // Sin acceso a localStorage: se queda el tema claro.
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
