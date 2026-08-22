/**
 * Plan 023 E3: eine Zeile, deutsch, lebendig.
 *
 * Geprüft wird genau das, was die Abnahme verlangt und was sich ohne Gerät
 * prüfen lässt: dass die Zeile sofort da ist, dass sie deutsch ist, dass sie
 * sich mindestens alle zwei Sekunden ändert, und dass die Rangfolge stimmt.
 * Dass sie auf dem Orin innerhalb einer Sekunde erscheint, gehört in die
 * Live-Abnahme.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Denkzeile, laufText, dauerText } from '../Denkzeile';
import type { AgentToolStep } from '@/contexts/ChatContext';

const schritt = (p: Partial<AgentToolStep>): AgentToolStep => ({
  tool: 'dateien_lesen',
  status: 'done',
  ...p,
});

describe('laufText (Plan 023 E3)', () => {
  it('nennt den jüngsten laufenden Schritt, nicht den ersten', () => {
    const text = laufText({
      steps: [
        schritt({ id: 1, tool: 'dateien_suchen', status: 'done', params: { muster: '*.md' } }),
        schritt({
          id: 2,
          tool: 'dateien_lesen',
          status: 'running',
          params: { aktion: 'read', pfad: 'a.md' },
        }),
      ],
      denktGerade: false,
    });
    expect(text).toBe('liest a.md');
  });

  it('zieht einen laufenden Schritt jeder allgemeinen Meldung vor', () => {
    // Ein laufender Schritt ist die konkreteste Auskunft, die es gibt.
    const text = laufText({
      steps: [schritt({ id: 1, tool: 'terminal', status: 'running', params: { befehl: 'ls' } })],
      statusMessage: 'Modell wird geladen',
      denktGerade: true,
    });
    expect(text).toBe('führt aus: ls');
  });

  it('nimmt die Meldung des Backends, wenn kein Schritt läuft', () => {
    expect(
      laufText({ steps: [], statusMessage: 'Platz 2 in der Warteschlange', denktGerade: true })
    ).toBe('Platz 2 in der Warteschlange');
  });

  it('sagt „denkt nach", zeigt aber nie den englischen Denktext', () => {
    expect(laufText({ steps: [], denktGerade: true })).toBe('denkt nach');
  });

  it('fällt auf ein ehrliches „arbeitet" zurück', () => {
    expect(laufText({ steps: [], denktGerade: false })).toBe('arbeitet');
  });

  it('ist in jedem Fall deutsch', () => {
    const faelle = [
      laufText({ steps: [], denktGerade: false }),
      laufText({ steps: [], denktGerade: true }),
      laufText({
        steps: [schritt({ id: 1, kind: 'plan', tool: 'plan', status: 'running' })],
        denktGerade: false,
      }),
      laufText({
        steps: [schritt({ id: 1, tool: 'web_suche', status: 'running', params: { frage: 'x' } })],
        denktGerade: false,
      }),
    ];
    for (const text of faelle) {
      expect(text).not.toMatch(/\b(thinking|searching|reading|writing|running)\b/i);
    }
  });
});

describe('dauerText', () => {
  it('zählt bis 99 in Sekunden', () => {
    expect(dauerText(0)).toBe('0 s');
    expect(dauerText(99)).toBe('99 s');
  });

  it('wechselt danach auf Minuten', () => {
    expect(dauerText(100)).toBe('1:40 min');
    expect(dauerText(125)).toBe('2:05 min');
    expect(dauerText(3600)).toBe('60:00 min');
  });
});

describe('Denkzeile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ist sofort da, ohne auf ein Ereignis aus dem Netz zu warten', () => {
    render(<Denkzeile steps={[]} />);
    expect(screen.getByTestId('denkzeile')).toBeInTheDocument();
    expect(screen.getByTestId('denkzeile-text')).toHaveTextContent('arbeitet');
    expect(screen.getByTestId('denkzeile-dauer')).toHaveTextContent('0 s');
  });

  it('ändert sich mindestens alle zwei Sekunden, auch wenn nichts passiert', () => {
    // Das ist der Kern der Abnahme. Käme die Bewegung nur aus den
    // Schritt-Ereignissen, stünde die Zeile während einer langen Modellrunde
    // minutenlang still, und niemand könnte von außen unterscheiden, ob das
    // Gerät arbeitet oder hängt.
    render(<Denkzeile steps={[]} />);
    const vorher = screen.getByTestId('denkzeile-dauer').textContent;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('denkzeile-dauer').textContent).not.toBe(vorher);
  });

  it('zeigt den Gedankengang erst aufgeklappt', () => {
    render(<Denkzeile steps={[]} thinking="Let me think about this" />);
    expect(screen.getByTestId('denkzeile-text')).toHaveTextContent('denkt nach');
    expect(screen.queryByText(/Let me think/)).not.toBeInTheDocument();
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByText(/Let me think/)).toBeInTheDocument();
  });

  it('trägt die Details erst nach dem Aufklappen', () => {
    render(
      <Denkzeile steps={[]}>
        <div data-testid="details-inhalt">Schrittliste</div>
      </Denkzeile>
    );
    expect(screen.queryByTestId('details-inhalt')).not.toBeInTheDocument();
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByTestId('details-inhalt')).toBeInTheDocument();
  });

  it('meldet den Wechsel an Hilfsmittel weiter', () => {
    render(<Denkzeile steps={[]} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-live', 'polite');
  });
});
