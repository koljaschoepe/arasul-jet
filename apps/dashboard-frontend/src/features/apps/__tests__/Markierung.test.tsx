/**
 * Die Markierung auf dem Bildschirmfoto (J42, M7): Ziehen ergibt einen Rahmen,
 * Tippen ein Quadrat um den Punkt, beides in Anteilen des Bildes.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Markierung } from '../rueckmeldung/Markierung';

// jsdom kennt `PointerEvent` nicht; ohne diese Klasse kämen Koordinaten nie an.
if (!('PointerEvent' in window)) {
  class Zeiger extends MouseEvent {
    pointerId: number;
    constructor(typ: string, init: PointerEventInit = {}) {
      super(typ, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.assign(window, { PointerEvent: Zeiger });
}

function flaecheMit400x200() {
  const flaeche = screen.getByTestId('rueckmeldung-markierung');
  flaeche.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 50,
      width: 400,
      height: 200,
      right: 500,
      bottom: 250,
      x: 100,
      y: 50,
    }) as DOMRect;
  return flaeche;
}

describe('Markierung', () => {
  it('Ziehen ergibt das Rechteck in Anteilen, auch rückwärts gezogen', () => {
    const beiMarkierung = vi.fn();
    render(
      <Markierung
        bild="data:image/png;base64,AA=="
        markierung={null}
        beiMarkierung={beiMarkierung}
      />
    );
    const f = flaecheMit400x200();
    fireEvent.pointerDown(f, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(f, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(f, { clientX: 200, clientY: 100, pointerId: 1 });
    expect(beiMarkierung).toHaveBeenLastCalledWith({ x: 0.25, y: 0.25, breite: 0.25, hoehe: 0.25 });
  });

  it('Tippen setzt ein Quadrat um den Punkt, nie über den Rand', () => {
    const beiMarkierung = vi.fn();
    render(
      <Markierung
        bild="data:image/png;base64,AA=="
        markierung={null}
        beiMarkierung={beiMarkierung}
      />
    );
    const f = flaecheMit400x200();
    fireEvent.pointerDown(f, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(f, { clientX: 300, clientY: 150, pointerId: 1 });
    const m = beiMarkierung.mock.lastCall?.[0];
    expect(m.breite).toBeCloseTo(0.12);
    // Ein Quadrat auf dem Schirm: doppelt so hoch in Anteilen, weil das Bild halb so hoch ist.
    expect(m.hoehe).toBeCloseTo(0.24);
    expect(m.x + m.breite / 2).toBeCloseTo(0.5);
    expect(m.y + m.hoehe / 2).toBeCloseTo(0.5);
  });

  it('zeigt die Stelle als Rahmen über dem Bild', () => {
    render(
      <Markierung
        bild="data:image/png;base64,AA=="
        markierung={{ x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.4 }}
        beiMarkierung={() => {}}
      />
    );
    const stelle = screen.getByTestId('rueckmeldung-stelle');
    expect(stelle.style.left).toBe('10%');
    expect(stelle.style.height).toBe('40%');
  });
});
