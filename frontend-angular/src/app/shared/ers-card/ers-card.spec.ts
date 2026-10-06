import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CardAction, ErsCard } from './ers-card';

@Component({
  imports: [ErsCard, CardAction],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ers-card heading="Atención">
      @if (open()) {
        <button card-action type="button">Resolver</button>
      }
      <p>Cuerpo</p>
    </ers-card>
  `,
})
class Host {
  readonly open = signal(true);
}

describe('ErsCard (ngAfterContentInit / ngAfterContentChecked)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('cuenta el botón proyectado y lo muestra en la cabecera', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const actions: HTMLElement = fixture.nativeElement.querySelector('.card__actions');
    expect(actions.hidden).toBe(false);
    expect(actions.textContent).toContain('Resolver');
  });

  it('se entera cuando el padre quita el botón', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.card__actions').hidden).toBe(true);
  });
});
