/**
 * Die Kennzahlkachel behebt zwei Befunde des Rundgangs. Beide sind hier
 * geprüft: kein Icon (F-24) und feste Spaltenzahl statt auto-fit (F-25).
 */

import { render, screen } from '@testing-library/react';
import { StatTile, StatGrid } from '../StatTile';

describe('StatTile', () => {
  it('zeigt Beschriftung, Wert und Einheit', () => {
    render(<StatTile label="Arbeitsspeicher" value="41,8" unit="%" />);
    expect(screen.getByText('Arbeitsspeicher')).toBeInTheDocument();
    expect(screen.getByText('41,8')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('nimmt eine Zusatzzeile auf', () => {
    render(<StatTile label="Arbeitsspeicher" value="41,8" unit="%" note="25,5 / 61 GB" />);
    expect(screen.getByText('25,5 / 61 GB')).toBeInTheDocument();
  });

  it('bringt kein Symbol mit, auch nicht als leere Fläche (F-24)', () => {
    const { container } = render(<StatTile label="Temperatur" value="47" unit="°C" />);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('bleibt auf der Dichte-Skala, nicht auf Tailwinds Voreinstellung', () => {
    // Der Systemstatus ist eine normierte Ansicht; DESIGN_SYSTEM.md schreibt
    // dort p-ui-3 als Karten-Innenabstand vor. Die Kachel steht unmittelbar
    // neben Flächen, die dieser Skala folgen.
    const { container } = render(<StatTile label="Temperatur" value="47" unit="°C" />);
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('p-ui-3');
    expect(klassen).not.toContain('p-4');
  });
});

describe('StatGrid', () => {
  it('legt die Spaltenzahl fest und benutzt kein auto-fit (F-25)', () => {
    // auto-fit füllt so viele Spalten, wie hineinpassen. Bei vier Kacheln
    // ergibt das drei plus eine allein. Genau das soll nicht mehr vorkommen.
    const { container } = render(
      <StatGrid>
        <StatTile label="A" value="1" />
      </StatGrid>
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
