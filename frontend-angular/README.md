# ERS · Centro de control en Angular

Módulo Angular 22 del Emergency Response System. Usa la misma API, el mismo
WebSocket y la misma sesión que el panel clásico, y aplica los 8 ciclos de vida
(lifecycle hooks) de los componentes.

Se ejecuta desde la raíz del proyecto:

```powershell
npm run ng:install   # dependencias (la primera vez)
npm run ng:dev       # desarrollo en http://localhost:4200 (backend en el 4000)
npm run ng:build     # compila a ../frontend/angular, que sirve Express en /angular/
npm run ng:test      # pruebas unitarias con Vitest
```

La explicación completa, con el uso de cada hook, está en
[`documentation/08-ANGULAR-CICLOS-DE-VIDA.md`](../documentation/08-ANGULAR-CICLOS-DE-VIDA.md).
