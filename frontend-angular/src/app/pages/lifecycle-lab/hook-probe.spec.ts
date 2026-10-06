import { TestBed } from '@angular/core/testing';

import { HookLog } from '../../core/hook-log';
import { HookProbe } from './hook-probe';

/** El registro publica en el siguiente turno del event loop. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('HookProbe (los 8 hooks)', () => {
  let log: HookLog;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HookProbe] });
    log = TestBed.inject(HookLog);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  const hooks = () =>
    log
      .events()
      .filter((event) => event.source === 'lab')
      .map((event) => event.hook)
      .reverse();

  it('al montarse ejecuta los hooks 1 a 7 en el orden oficial', async () => {
    const fixture = TestBed.createComponent(HookProbe);
    fixture.componentRef.setInput('priority', 'ALTA');
    fixture.detectChanges();
    await flush();

    expect(hooks()).toEqual([
      'ngOnChanges',
      'ngOnInit',
      'ngDoCheck',
      'ngAfterContentInit',
      'ngAfterContentChecked',
      'ngAfterViewInit',
      'ngAfterViewChecked',
    ]);
  });

  it('un @Input nuevo dispara ngOnChanges pero no repite ngOnInit', async () => {
    const fixture = TestBed.createComponent(HookProbe);
    fixture.componentRef.setInput('priority', 'BAJA');
    fixture.detectChanges();
    await flush();
    log.clear();

    fixture.componentRef.setInput('priority', 'CRITICA');
    fixture.detectChanges();
    await flush();

    expect(hooks()[0]).toBe('ngOnChanges');
    expect(hooks()).not.toContain('ngOnInit');
    expect(log.events().at(-1)?.detail).toContain('"BAJA" → "CRITICA"');
  });

  it('al destruirse ejecuta ngOnDestroy', async () => {
    const fixture = TestBed.createComponent(HookProbe);
    fixture.detectChanges();
    await flush();
    log.clear();

    fixture.destroy();
    await flush();

    expect(hooks()).toEqual(['ngOnDestroy']);
  });
});
