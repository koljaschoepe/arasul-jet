/**
 * Plan 023 F1: die Kopfzeile des Terminals bleibt einzeilig.
 *
 * Gemeldet: „Verbunden", „intern", „Quick Launch", „KI-Zugang" und das
 * Wiederholen-Symbol brechen im Standardlayout auf zwei Zeilen, und das
 * Terminal wird bei jeder Größenänderung kürzer.
 *
 * Die Ursache stand wörtlich im Markup: `flex-wrap`. Statt umzubrechen wird
 * jetzt zusammengefasst, gesteuert über eine Container-Abfrage.
 *
 * Was hier geprüft wird, ist der MECHANISMUS: kein `flex-wrap` mehr, und beide
 * Fassungen der Werkzeuge sind da, die breite und die schmale. Dass die Zeile
 * bei 400 Pixeln wirklich einzeilig ist, misst `scripts/test/chat-abnahme.mjs`
 * am Gerät; eine Container-Abfrage lässt sich in jsdom nicht auswerten, dort
 * hat kein Element eine Breite.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../useTerminal', () => ({
  useTerminal: () => ({
    terminalRef: { current: null },
    isConnected: true,
    isConnecting: false,
    error: null,
    reconnect: vi.fn(),
    fit: vi.fn(),
    sendInput: vi.fn(),
  }),
}));
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }),
}));

import SandboxTerminal from '../SandboxTerminal';

function zeichne(netz: 'isolated' | 'internal' | 'infrastructure' = 'internal') {
  return render(
    <SandboxTerminal
      projectId="p1"
      terminalName="main"
      containerStatus="running"
      networkMode={netz}
    />
  );
}

describe('Kopfzeile des Terminals (Plan 023 F1)', () => {
  it('bricht nicht mehr um', () => {
    const { container } = zeichne();
    const umbrechend = container.querySelectorAll('.flex-wrap');
    expect(umbrechend).toHaveLength(0);
  });

  it('stellt den Container-Kontext her, an dem die Breite gemessen wird', () => {
    // Die Breite, die zaehlt, ist die des PANELS und nicht die des Fensters:
    // der Nutzer zieht das Panel schmal, waehrend das Fenster breit bleibt.
    const { container } = zeichne();
    expect(container.querySelector('.\\@container')).toBeTruthy();
  });

  it('haelt beide Fassungen der Werkzeuge bereit', () => {
    zeichne();
    // Breit: zwei eigene Knoepfe.
    expect(screen.getByTestId('terminal-quick-launch')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-ki-zugang')).toBeInTheDocument();
    // Schmal: dieselben Punkte in EINEM Menue. Nichts verschwindet.
    expect(screen.getByTestId('terminal-werkzeuge')).toBeInTheDocument();
  });

  it('blendet die breite Fassung unterhalb der Grenze aus und das Menue darueber', () => {
    zeichne();
    expect(screen.getByTestId('terminal-quick-launch').className).toContain('@[34rem]:inline-flex');
    expect(screen.getByTestId('terminal-ki-zugang').className).toContain('@[34rem]:inline-flex');
    expect(screen.getByTestId('terminal-werkzeuge').className).toContain('@[34rem]:hidden');
  });

  it('gibt dem Werkzeug-Menue einen Namen fuer Hilfsmittel', () => {
    zeichne();
    expect(screen.getByTestId('terminal-werkzeuge')).toHaveAttribute('aria-label', 'Werkzeuge');
  });

  it('zeigt den Modus schmal als Kuerzel, breit als Wort', () => {
    zeichne('infrastructure');
    // Beide Fassungen stehen im Markup; welche sichtbar ist, entscheidet die
    // Container-Breite. Der volle Name bleibt zudem im `title`.
    expect(screen.getByText('Infrastruktur')).toBeInTheDocument();
    expect(screen.getByText('I')).toBeInTheDocument();
  });
});

/**
 * Plan 023 F1, Nachtrag aus der Live-Messung: die Kopfzeile trägt ein eigenes
 * Kennzeichen.
 *
 * Die Messung suchte sie zuerst über ihren Aufbau (der Kasten mit dem
 * Verbindungszustand darin). Das ging genau so lange gut, bis der Umbau den
 * Zustand in eine eigene Hülle steckte: danach traf der Selektor ein inneres
 * Element von 40 Pixeln Breite und meldete grün. Ein grünes Ergebnis aus einem
 * falschen Selektor ist schlimmer als ein rotes.
 */
describe('Kennzeichen der Kopfzeile (Plan 023 F1)', () => {
  it('ist eindeutig auffindbar', () => {
    const { container } = zeichne();
    const kopf = container.querySelector('[data-testid="terminal-kopfzeile"]');
    expect(kopf).toBeTruthy();
    // Und es ist derselbe Kasten, der den Container-Kontext herstellt.
    expect(kopf?.className).toContain('@container');
  });
});
