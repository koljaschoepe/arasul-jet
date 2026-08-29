/**
 * Die Kennzahl behebt zwei Befunde des Rundgangs vom 19.08.2026, und seit H5
 * einen dritten. Alle drei sind hier geprueft: kein Symbol (F-24), feste
 * Spaltenzahl statt `auto-fit` (F-25) und keine zweite Flaeche (H5).
 *
 * Die Datei ist mit dem Baustein aus der Shell mitgezogen
 * (`components/ui/__tests__/StatTile.test.tsx`).
 */

import { render, screen } from '@testing-library/react';
import { Kennzahl, Kennzahlen } from '../muster/Kennzahl';

describe('Kennzahl', () => {
  it('zeigt Beschriftung, Wert und Einheit', () => {
    render(<Kennzahl beschriftung="Arbeitsspeicher" wert="41,8" einheit="%" />);
    expect(screen.getByText('Arbeitsspeicher')).toBeInTheDocument();
    expect(screen.getByText('41,8')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('nimmt eine Fussnote auf', () => {
    render(
      <Kennzahl beschriftung="Arbeitsspeicher" wert="41,8" einheit="%" fussnote="25,5 / 61 GB" />
    );
    expect(screen.getByText('25,5 / 61 GB')).toBeInTheDocument();
  });

  it('bringt kein Symbol mit, auch nicht als leere Flaeche (F-24)', () => {
    const { container } = render(<Kennzahl beschriftung="Temperatur" wert="47" einheit="°C" />);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('bleibt auf der Dichte-Skala, nicht auf Tailwinds Voreinstellung', () => {
    const { container } = render(<Kennzahl beschriftung="Temperatur" wert="47" einheit="°C" />);
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('p-ui-3');
    expect(klassen).not.toContain('p-4');
  });

  it('steht auf der Flaeche der Seite und traegt eine Linie (H5)', () => {
    // Bis H5 stand die Kachel auf `bg-card`, also auf einem eigenen Weiss
    // ueber dem Grau der Seite. „Eine Flaechenfarbe" (DESIGN.md, Regel 2)
    // laesst `bg-card` nur erhabenen Elementen; eine Kachel in einem Raster
    // ist keines. Was bleibt, ist der Rand.
    const { container } = render(<Kennzahl beschriftung="Temperatur" wert="47" />);
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('border-border');
    expect(klassen).not.toContain('bg-card');
  });
});

describe('Kennzahlen', () => {
  it('legt die Spaltenzahl fest und benutzt kein auto-fit (F-25)', () => {
    // auto-fit fuellt so viele Spalten, wie hineinpassen. Bei vier Kacheln
    // ergibt das drei plus eine allein. Genau das soll nicht vorkommen.
    const { container } = render(
      <Kennzahlen>
        <Kennzahl beschriftung="A" wert="1" />
      </Kennzahlen>
    );
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('gap-ui-2');
    expect(klassen).toContain('grid-cols-1');
    expect(klassen).toContain('sm:grid-cols-2');
    expect(klassen).toContain('lg:grid-cols-4');
    expect(klassen).not.toContain('auto-fit');
    expect(klassen).not.toContain('grid-cols-3');
  });
});
