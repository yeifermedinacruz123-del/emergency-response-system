import { TestBed } from '@angular/core/testing';

import { Emergency } from '../../core/models';
import { EmergencyTable } from './emergency-table';

function emergency(id: number): Emergency {
  return {
    id,
    code: `ERS-2026-${String(id).padStart(6, '0')}`,
    title: `Emergencia ${id}`,
    is_sos: false,
    reported_at: new Date().toISOString(),
    type_code: 'MEDICA',
    type_name: 'Médica',
    type_icon: '🚑',
    type_color: '#dc2626',
    status_code: 'PENDIENTE',
    status_name: 'Pendiente',
    status_color: '#f59e0b',
    priority_code: 'ALTA',
    priority_name: 'Alta',
    priority_color: '#ea580c',
    priority_level: 3,
    latitude: 4.14,
    longitude: -73.62,
    address: null,
    zone_name: 'Comuna 1',
    assignment_count: 0,
  };
}

describe('EmergencyTable (ngDoCheck)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('resalta la fila agregada al MISMO arreglo, que ngOnChanges no ve', () => {
    const rows = [emergency(1), emergency(2)];
    const fixture = TestBed.createComponent(EmergencyTable);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tr.is-fresh').length).toBe(0);

    rows.unshift(emergency(3)); // misma referencia
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const fresh = fixture.nativeElement.querySelectorAll('tr.is-fresh');
    expect(fresh.length).toBe(1);
    expect(fresh[0].textContent).toContain('ERS-2026-000003');
  });

  it('un arreglo nuevo (filtros, otra página) no cuenta como llegada', () => {
    const fixture = TestBed.createComponent(EmergencyTable);
    fixture.componentRef.setInput('rows', [emergency(1)]);
    fixture.detectChanges();

    fixture.componentRef.setInput('rows', [emergency(4), emergency(5)]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('tr.is-fresh').length).toBe(0);
  });
});
