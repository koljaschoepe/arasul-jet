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

  it('liegt deckend auf `--card` und traegt eine Linie (5.9.0)', () => {
    // Von H5 bis 5.8 stand die Kachel durchsichtig auf der Seite. In einer
    // App ist der Grund seit 5.7 ein Verlauf, und Inhalt bleibt deckend
    // (Entwurf, Glas, Regel 1): die Kachel liegt wie Tabelle und Karte auf
    // `--card`, mit Rand.
    const { container } = render(<Kennzahl beschriftung="Temperatur" wert="47" />);
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('border-border');
    expect(klassen).toContain('bg-card');
  });

  it('zeichnet den Verlauf als Linie ohne recharts, unter zwei Werten keine', () => {
    const { container, rerender } = render(
      <Kennzahl beschriftung="Belege" wert="128" verlauf={[1, 3, 2, 5]} />
    );
    const pfad = container.querySelector('[data-slot="kennzahl-verlauf"] path');
    expect(pfad?.getAttribute('d')).toMatch(/^M0\.0 /);
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
    rerender(<Kennzahl beschriftung="Belege" wert="128" verlauf={[5]} />);
    expect(container.querySelector('[data-slot="kennzahl-verlauf"]')).toBeNull();
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
    // Seit 5.9.1 am Handy zwei Spalten statt einer.
    expect(klassen).toContain('grid-cols-2');
    expect(klassen).toContain('lg:grid-cols-4');
    expect(klassen).not.toContain('auto-fit');
    expect(klassen).not.toContain('grid-cols-3');
  });
});
