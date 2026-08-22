/**
 * Plan 023 E4: was der Agent an einer Datei geändert hat, im Chat.
 *
 * Der Kern der Abnahme ist „drei aufklappbare Diffs", und der Kern der
 * Umsetzung ist, WANN geholt wird: erst beim Aufklappen. Ein Lauf, der zehn
 * Dateien anfasst, würde sonst zwanzig Abfragen auslösen, von denen niemand
 * eine angesehen hat, und zwar auf einem Gerät, das gerade ein Modell rechnet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DateiDiff } from '../DateiDiff';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get }) }));

function antworten({
  jetzt,
  vorher,
  binaer = false,
  zuGross = false,
}: {
  jetzt: string;
  vorher?: string | null;
  binaer?: boolean;
  zuGross?: boolean;
}) {
  get.mockImplementation((pfad: string) => {
    if (pfad.includes('/dateien/inhalt')) {
      return Promise.resolve({ data: { inhalt: jetzt, binaer, zuGross } });
    }
    return Promise.resolve({ data: { anzahl: 1, vorherInhalt: vorher ?? null } });
  });
}

describe('DateiDiff (Plan 023 E4)', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('holt nichts, solange niemand aufklappt', () => {
    antworten({ jetzt: 'a\nb' });
    render(<DateiDiff projectId="p1" pfad="a.md" neu={false} />);
    expect(get).not.toHaveBeenCalled();
  });

  it('zeigt beim Aufklappen die geänderten Zeilen mit Zähler', async () => {
    antworten({ jetzt: 'Zeile eins\nZeile NEU', vorher: 'Zeile eins\nZeile alt' });
    render(<DateiDiff projectId="p1" pfad="a.md" neu={false} />);
    fireEvent.click(screen.getByTestId('datei-diff-schalter'));

    await waitFor(() => expect(screen.getByTestId('datei-diff-zeilen')).toBeInTheDocument());
    const block = screen.getByTestId('datei-diff-zeilen');
    expect(block).toHaveTextContent('Zeile NEU');
    expect(block).toHaveTextContent('Zeile alt');
    expect(screen.getByTestId('datei-diff-schalter')).toHaveTextContent('+1');
    expect(screen.getByTestId('datei-diff-schalter')).toHaveTextContent('−1');
  });

  it('fragt bei einer NEUEN Datei nicht nach einer Vorgeschichte', async () => {
    // Eine neue Datei hat keine. Die zweite Abfrage waere eine Anfrage an das
    // Geraet, deren Antwort von vornherein feststeht.
    antworten({ jetzt: 'Hallo' });
    render(<DateiDiff projectId="p1" pfad="neu.md" neu />);
    fireEvent.click(screen.getByTestId('datei-diff-schalter'));

    await waitFor(() => expect(screen.getByTestId('datei-diff-zeilen')).toBeInTheDocument());
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toContain('/dateien/inhalt');
    expect(screen.getByTestId('datei-diff-schalter')).toHaveTextContent('+1');
  });

  it('holt beim zweiten Aufklappen nicht erneut', async () => {
    antworten({ jetzt: 'x', vorher: 'y' });
    render(<DateiDiff projectId="p1" pfad="a.md" neu={false} />);
    const schalter = screen.getByTestId('datei-diff-schalter');
    fireEvent.click(schalter);
    await waitFor(() => expect(screen.getByTestId('datei-diff-zeilen')).toBeInTheDocument());
    const rufe = get.mock.calls.length;
    fireEvent.click(schalter);
    fireEvent.click(schalter);
    expect(get.mock.calls.length).toBe(rufe);
  });

  it('sagt bei einer Binärdatei, dass ein Vergleich nichts ergibt', async () => {
    antworten({ jetzt: '', binaer: true });
    render(<DateiDiff projectId="p1" pfad="bild.png" neu={false} />);
    fireEvent.click(screen.getByTestId('datei-diff-schalter'));
    await waitFor(() =>
      expect(screen.getByTestId('datei-diff-fehler')).toHaveTextContent('keine Textdatei')
    );
  });

  it('lässt den Chat nicht wegen eines Vergleichs rot werden', async () => {
    // Eine Karte ohne Diff ist immer noch eine Karte, die zur Datei fuehrt.
    get.mockRejectedValue(new Error('weg'));
    render(<DateiDiff projectId="p1" pfad="a.md" neu={false} />);
    fireEvent.click(screen.getByTestId('datei-diff-schalter'));
    await waitFor(() =>
      expect(screen.getByTestId('datei-diff-fehler')).toHaveTextContent('nicht laden')
    );
  });

  it('sagt es, wenn sich am Inhalt nichts geändert hat', async () => {
    antworten({ jetzt: 'gleich', vorher: 'gleich' });
    render(<DateiDiff projectId="p1" pfad="a.md" neu={false} />);
    fireEvent.click(screen.getByTestId('datei-diff-schalter'));
    await waitFor(() => expect(screen.getByTestId('datei-diff-schalter')).toHaveTextContent('+0'));
  });
});
