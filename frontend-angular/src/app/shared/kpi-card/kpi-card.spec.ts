import { TestBed } from '@angular/core/testing';

import { KpiCard } from './kpi-card';

describe('KpiCard (ngOnChanges)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('la carga inicial no muestra variación', () => {
    const fixture = TestBed.createComponent(KpiCard);
    fixture.componentRef.setInput('label', 'Activas');
    fixture.componentRef.setInput('value', 24);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.kpi__delta')).toBeNull();
  });

  it('cuando el valor cambia muestra la diferencia con el anterior', () => {
    const fixture = TestBed.createComponent(KpiCard);
    fixture.componentRef.setInput('label', 'Activas');
    fixture.componentRef.setInput('value', 24);
    fixture.detectChanges();

    fixture.componentRef.setInput('value', 26);
    fixture.detectChanges();

    const delta: HTMLElement = fixture.nativeElement.querySelector('.kpi__delta');
    expect(delta.textContent).toContain('+2');
    expect(fixture.nativeElement.querySelector('.kpi').classList).toContain('is-pulsing');
  });
});
