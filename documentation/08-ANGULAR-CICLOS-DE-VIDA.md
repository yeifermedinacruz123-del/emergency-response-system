# 08 — Módulo Angular y ciclos de vida

## Emergency Response System (ERS) — Centro de control en Angular 22

---

## 1. Qué se agregó y por qué

El curso pidió aplicar **Angular** y sus **ciclos de vida** (*lifecycle hooks*)
al proyecto, partiendo de la demo vista en clase (`angular-lifecycle-demo`,
Angular 22, un componente con los 8 hooks que escribe en la consola).

En lugar de reescribir el panel clásico, que ya funciona y está verificado, se
construyó un **segundo centro de control en Angular** dentro del mismo sistema:

- vive en `/angular/` y lo sirve el mismo Express;
- usa la misma API REST, la misma base de datos y el mismo Socket.IO;
- comparte la sesión con el panel clásico (las mismas claves de `localStorage`);
- el panel clásico lo enlaza en su menú como «Centro de control (Angular)».

La PWA del ciudadano y el panel clásico siguen en HTML, CSS y JavaScript puro.

| | Panel clásico | Módulo Angular |
|---|---|---|
| Carpeta | `frontend/pages`, `frontend/js` | `frontend-angular/` (fuente) → `frontend/angular/` (compilado) |
| Tecnología | JavaScript con módulos ES6, sin build | Angular 22, TypeScript, componentes standalone, signals |
| Usuarios | Los 4 roles | Operador y administrador |
| Pantallas | 10 | 6: acceso, dashboard, emergencias, detalle, mapa y ciclos de vida |

---

## 2. Qué es un hook del ciclo de vida

Un componente de Angular nace, cambia, se pinta y muere. En cada uno de esos
momentos Angular llama, si existe, a un método con un nombre fijo: eso es un
*hook*. El componente no los llama; los implementa y Angular los ejecuta en
este orden:

| # | Hook | Cuándo lo llama Angular | Veces |
|---|------|-------------------------|-------|
| 1 | `ngOnChanges` | Antes de `ngOnInit` y cada vez que cambia un `@Input` (por referencia). | Muchas |
| 2 | `ngOnInit` | Después del primer `ngOnChanges`. | Una |
| 3 | `ngDoCheck` | En cada detección de cambios. | Muchas |
| 4 | `ngAfterContentInit` | Cuando ya existe el contenido proyectado con `<ng-content>`. | Una |
| 5 | `ngAfterContentChecked` | Después de cada revisión del contenido proyectado. | Muchas |
| 6 | `ngAfterViewInit` | Cuando la vista del componente (y sus hijas) ya está en el DOM. | Una |
| 7 | `ngAfterViewChecked` | Después de cada revisión de la vista. | Muchas |
| 8 | `ngOnDestroy` | Justo antes de destruir el componente. | Una |

---

## 3. Dónde se usa cada hook en el ERS

Ningún hook está puesto «para mostrar»: cada uno resuelve algo que el centro
de control necesita.

### 1. `ngOnChanges` — `shared/kpi-card/kpi-card.ts`

Los indicadores del dashboard (activas, SOS, pendientes…) llegan como `@Input`.
Cuando el tiempo real cambia un valor, `SimpleChanges` trae el anterior y el
nuevo, y la tarjeta muestra la diferencia («▲ +1») y se ilumina un momento.

```ts
ngOnChanges(changes: SimpleChanges): void {
  const change = changes['value'];
  if (!change || change.firstChange) return;          // la carga inicial no es un cambio
  const diff = change.currentValue - change.previousValue;
  this.delta.set(diff);
  this.pulsing.set(true);
}
```

También lo usan `MapView` (redibuja los marcadores sin recrear el mapa) y
`EmergencyDetail`: el `:id` de la ruta llega como `@Input`, y si el operador
pasa de una emergencia a otra, Angular **reutiliza** el componente; en
`ngOnChanges` se sale de la sala de la emergencia anterior y se entra a la nueva.

### 2. `ngOnInit` — `pages/shell/shell.ts` y las páginas

`Shell` (cabecera y menú) abre la conexión Socket.IO una sola vez para todo el
módulo. Dashboard, Emergencias y Mapa cargan sus datos de la API y se suscriben
a los eventos del socket.

### 3. `ngDoCheck` — `pages/emergencies/emergency-table.ts`

La página de emergencias mete las que llegan por el socket en el **mismo
arreglo** con `unshift()`. Como la referencia no cambia, `ngOnChanges` no se
entera. `ngDoCheck` se ejecuta en cada revisión y un `IterableDiffer` compara el
contenido: encuentra la fila nueva, la resalta y, como la tabla es `OnPush`,
pide repintarla con `markForCheck()`.

```ts
ngDoCheck(): void {
  const replaced = this.rows !== this.lastRows;   // arreglo nuevo = recarga, no llegada
  this.lastRows = this.rows;
  const changes = this.differ.diff(this.rows);
  if (!changes || replaced) return;
  changes.forEachAddedItem((record) => this.fresh.add(record.item.id));
  this.cdr.markForCheck();                        // la tabla es OnPush
}
```

### 4 y 5. `ngAfterContentInit` / `ngAfterContentChecked` — `shared/ers-card/ers-card.ts`

`ErsCard` es la tarjeta contenedora del panel. Los botones que el padre le pasa
con el atributo `card-action` llegan por `<ng-content>` y se ubican en la
cabecera. En `ngAfterContentInit` la tarjeta los cuenta por primera vez (antes
la `QueryList` está vacía). En `ngAfterContentChecked` se entera si cambiaron:
al resolver una emergencia desaparecen «Resolver», «Asignar» y «Cancelar», y la
tarjeta oculta la barra de acciones.

### 6. `ngAfterViewInit` — `shared/map-view/map-view.ts`

Leaflet necesita un `<div>` que ya exista. En el constructor o en `ngOnInit` el
`@ViewChild` todavía no está listo; en `ngAfterViewInit` sí, y ahí se crea el
mapa con las teselas de OpenStreetMap.

### 7. `ngAfterViewChecked` — `pages/emergency-detail/chat.ts`

Cuando llega un mensaje del chat, el único momento en que ya está en el DOM es
después de pintar la vista. Ahí se baja el scroll al final. Como el hook corre
en cada revisión, solo se mueve si cambió la cantidad de mensajes; si no, el
operador no podría subir a leer los anteriores.

### 8. `ngOnDestroy` — `Shell`, `EmergencyDetail`, `MapView` y las páginas

- `Shell` cierra el WebSocket al cerrar sesión.
- `EmergencyDetail` le pide al servidor salir de la sala `emergency:<id>`.
- `MapView` ejecuta `map.remove()` para liberar las capas y eventos de Leaflet.
- Dashboard, Emergencias y Mapa cancelan sus suscripciones al socket.

Sin esto, cada vez que se entra y se sale de una pantalla quedarían
suscripciones vivas recibiendo eventos para un componente que ya no existe.

---

## 4. Cómo verlos funcionar

**Página «Ciclos de vida»** (`/angular/ciclos-de-vida`). Un laboratorio con
`HookProbe`, un componente con forma de tarjeta de emergencia que implementa
los 8 hooks, como el de clase. Cada botón provoca una situación y el registro
muestra, en orden, qué hooks ejecutó Angular:

| Acción | Hooks que se ven |
|--------|------------------|
| Abrir la página (montar) | 1 → 2 → 3 → 4 → 5 → 6 → 7 |
| Cambiar prioridad (`@Input`) | `ngOnChanges` → `ngDoCheck` → `ngAfterContentChecked` → `ngAfterViewChecked` |
| Asignar unidad con `push()` al mismo arreglo | `ngDoCheck` (lo detecta) → … **sin** `ngOnChanges` |
| Cambiar la nota proyectada (`ng-content`) | `ngDoCheck` → `ngAfterContentChecked` → `ngAfterViewChecked` |
| «+1 min» (evento interno) | `ngDoCheck` → `ngAfterContentChecked` → `ngAfterViewChecked` |
| Desmontar | `ngOnDestroy` |

**Botón «Hooks en vivo»** (abajo a la derecha, en todas las pantallas). Abre un
registro con los hooks de los componentes **reales** mientras se usa el
sistema: al abrir el detalle se ve `ngOnChanges` del id, `ngAfterViewInit` del
mapa y `ngAfterContentInit` de la tarjeta; al salir, los `ngOnDestroy`.

Los dos también escriben en la consola del navegador (F12), igual que la demo
de clase.

### Un detalle de diseño: el registro no puede alimentarse solo

Los hooks 3, 5 y 7 se ejecutan en **cada** detección de cambios. Si al
anotarlos se escribiera directo en un signal que se pinta en la misma página,
cada anotación pediría otra detección de cambios, que volvería a ejecutar los
hooks: un bucle. Se evita de dos formas:

1. `HookLog` acumula los eventos y los publica un instante después, fuera del
   ciclo de detección (`core/hook-log.ts`).
2. El componente de prueba vive dentro de `LabStage`, que es `OnPush`: cuando el
   registro se repinta, el laboratorio no se vuelve a revisar.

La prueba de navegador lo comprueba: con el laboratorio quieto, el registro no
crece.

---

## 5. Arquitectura del módulo

```text
frontend-angular/src/app/
├── app.config.ts        router (carga perezosa), HttpClient con interceptor
├── app.routes.ts        /login · / (Shell) → dashboard, emergencias, :id, mapa, ciclos-de-vida
├── core/
│   ├── session.ts       sesión compartida con el panel clásico, login y renovación del token
│   ├── auth.ts          interceptor (token + reintento con renovación) y guards por rol
│   ├── api.ts           acceso tipado a la API REST
│   ├── realtime.ts      una sola conexión Socket.IO; salas de emergencia
│   ├── hook-log.ts      registro de hooks para verlos en pantalla
│   └── models.ts        tipos de los datos de la API
├── shared/
│   ├── ers-card/        tarjeta con contenido proyectado     (hooks 4 y 5)
│   ├── kpi-card/        indicador del dashboard              (hook 1)
│   ├── map-view/        mapa Leaflet                         (hooks 1, 6 y 8)
│   ├── badge/           etiqueta de estado y prioridad
│   └── hooks-panel/     «Hooks en vivo» y la línea de tiempo
└── pages/
    ├── login/
    ├── shell/           cabecera, menú y conexión              (hooks 2 y 8)
    ├── dashboard/                                              (hooks 2 y 8)
    ├── emergencies/     lista + emergency-table                (hook 3)
    ├── emergency-detail/ detalle + chat                        (hooks 1, 2, 7 y 8)
    ├── map-page/
    └── lifecycle-lab/   laboratorio: lab-stage + hook-probe    (los 8)
```

Decisiones:

- **Componentes standalone y `OnPush` en todos.** Angular 22 trabaja sin
  zone.js: la vista se actualiza cuando cambia un signal, un `@Input` o hay un
  evento. Es justo lo que hace visible a `ngDoCheck` + `markForCheck()`.
- **Hooks con `@Input` decorados**, como en la demo de clase, para que
  `SimpleChanges` muestre el valor anterior y el nuevo.
- **Un solo socket** en `Realtime`. Los componentes no lo tocan: se suscriben con
  `on()` y cancelan en su `ngOnDestroy`.
- **Seguridad:** Angular escapa todo lo que se interpola (una emergencia de
  prueba con `<script>` en el título se ve como texto). Los popups del mapa se
  arman con `textContent`. La política CSP del backend no cambió: el compilado
  no usa scripts en línea.

---

## 6. Compilar, probar y publicar

```powershell
npm run ng:install   # dependencias de frontend-angular/ (la primera vez)
npm run ng:dev       # desarrollo en http://localhost:4200, con proxy al backend del 4000
npm run ng:build     # compila a frontend/angular/
npm run ng:test      # 11 pruebas unitarias (Vitest)
```

`frontend/angular/` (el compilado) **se sube al repositorio**: Render publica lo
que hay en `frontend/` sin instalar Angular. Tras cambiar el código fuente hay
que volver a compilar antes de subir.

En el backend cambiaron tres cosas:

- `backend/src/app.js`: las rutas internas de Angular (`/angular/emergencias/7`)
  devuelven el `index.html` del módulo.
- `frontend/service-worker.js` (caché v9): la PWA no intercepta `/angular/`, para
  no servir un `index.html` viejo que apunte a archivos que ya no existen.
- `frontend/js/components/layout.js`: el enlace en el menú del panel clásico.

---

## 7. Verificación (5 de octubre de 2026)

| Prueba | Resultado |
|--------|-----------|
| `ng build` de producción | Sin avisos. Carga inicial de 302 kB (81 kB comprimido); cada pantalla se descarga aparte. |
| `ng test` (Vitest) | 11 / 11 |
| `npm run test:api` (incluye 5 nuevas del módulo Angular) | 114 / 114 |
| `npm run test:realtime` | 51 / 51 |
| `npm run test:security` | 56 / 56 |
| Recorrido en Chrome (login, dashboard, SOS en vivo, lista, detalle con mapa, chat, asignar, en proceso, resolver, mapa, laboratorio, tema oscuro, 390 px, panel clásico, salir) | 48 / 48, sin errores en consola |
