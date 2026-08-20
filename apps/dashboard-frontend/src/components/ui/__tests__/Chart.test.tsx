/**
 * Das Diagramm hat eine Zusage, die man prüfen kann: nur Grau und Blau (F-25).
 * Vorher liefen drei Linien in Violett, Blau und Orange.
 *
 * recharts misst seine Größe im Browser. jsdom liefert überall null, deshalb
 * ersetzt der Test den ResponsiveContainer durch feste Maße. Alles darunter
 * ist echtes recharts, sonst prüfte der Test nur die Attrappe.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Chart, Sparkline, SERIENFARBEN } from '../Chart';

vi.mock('recharts', async () => {
  const echt = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...echt,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 400, height: 280 } as Partial<Record<string, number>>),
  };
});

const DATEN = [
  { t: 1, RAM: 40, Swap: 5, Temp: 47 },
  { t: 2, RAM: 42, Swap: 6, Temp: 48 },
  { t: 3, RAM: 41, Swap: 5, Temp: 49 },
];

const REIHEN = [
  { key: 'RAM', name: 'Arbeitsspeicher', unit: '%' },
  { key: 'Swap', name: 'Auslagerung', unit: '%' },
  { key: 'Temp', name: 'Temperatur', unit: '°C' },
];

function striche(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path.recharts-curve.recharts-line-curve')).map(
    pfad => pfad.getAttribute('stroke') ?? ''
  );
}

describe('Chart', () => {
  it('beschreibt sich für Vorlesewerkzeuge', () => {
    render(
      <Chart
        data={DATEN}
        series={REIHEN}
        xKey="t"
        formatX={String}
        label="Auslastung der letzten 6 Stunden"
      />
    );
    expect(
      screen.getByRole('img', { name: 'Auslastung der letzten 6 Stunden' })
    ).toBeInTheDocument();
  });

  it('zeichnet eine Linie je Reihe', () => {
    const { container } = render(
      <Chart data={DATEN} series={REIHEN} xKey="t" formatX={String} label="Auslastung" />
    );
    expect(striche(container)).toHaveLength(REIHEN.length);
  });

  it('benutzt ausschließlich die Farben der Reihe Blau nach Grau (F-25)', () => {
    const { container } = render(
      <Chart data={DATEN} series={REIHEN} xKey="t" formatX={String} label="Auslastung" />
    );
    expect(striche(container)).toEqual([SERIENFARBEN[0], SERIENFARBEN[1], SERIENFARBEN[2]]);
  });

  it('bringt weder Violett noch Orange zurück', () => {
    // Die beiden Tokens, die der Vorläufer benutzt hat. Ein Rückfall würde
    // hier auffallen, auch wenn die Reihenfolge sich einmal ändert.
    const { container } = render(
      <Chart data={DATEN} series={REIHEN} xKey="t" formatX={String} label="Auslastung" />
    );
    const alle = striche(container).join(' ');
    expect(alle).not.toContain('--color-chart-2');
    expect(alle).not.toContain('--color-chart-3');
  });

  it('bringt keine eigene Karte mit, die Fläche stellt der Aufrufer', () => {
    const { container } = render(
      <Chart data={DATEN} series={REIHEN} xKey="t" formatX={String} label="Auslastung" />
    );
    const huelle = container.firstElementChild?.className ?? '';
    expect(huelle).not.toContain('bg-card');
    expect(huelle).not.toContain('border');
  });
});

describe('Sparkline', () => {
  it('zeigt nichts, solange es keine zwei Messwerte gibt', () => {
    const { container } = render(<Sparkline values={[47]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('überspringt Lücken und zeichnet den Rest', () => {
    const { container } = render(<Sparkline values={[47, null, 48, null, 49]} />);
    expect(striche(container)).toEqual([SERIENFARBEN[0]]);
  });

  it('bleibt für Vorlesewerkzeuge stumm, die Zahl steht daneben', () => {
    const { container } = render(<Sparkline values={[47, 48, 49]} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
