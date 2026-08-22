/**
 * Plan 023 E7: Dateien im Eingabefeld finden, mit `@`.
 *
 * Die beiden reinen Funktionen tragen die ganze Heikelheit: WO das Fragment
 * beginnt (nicht in einer Mailadresse) und WO der Cursor danach steht (hinter
 * dem eingesetzten Pfad, nicht am Zeilenende).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DateiMenue, dateiFragment, setzePfadEin } from '../DateiMenue';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get }) }));

describe('dateiFragment (Plan 023 E7)', () => {
  it('erkennt das Fragment am Wortanfang', () => {
    expect(dateiFragment('@kap', 4)).toBe('kap');
    expect(dateiFragment('Lies @kap', 9)).toBe('kap');
  });

  it('erkennt ein frisches @ ohne Buchstaben', () => {
    expect(dateiFragment('Lies @', 6)).toBe('');
  });

  it('geht NICHT auf eine Mailadresse los', () => {
    // Sonst zieht jede Frage mit einer Adresse darin ein Menue auf.
    expect(dateiFragment('Schreib an kolja@arasul.de', 26)).toBeNull();
  });

  it('endet am Leerzeichen', () => {
    expect(dateiFragment('@kapitel und weiter', 19)).toBeNull();
  });

  it('liest ab der CURSOR-Position, nicht ab dem Zeilenende', () => {
    // Wer mitten im Satz ergaenzt, meint die Stelle, an der er steht.
    const text = 'Lies @kap und dann noch etwas';
    expect(dateiFragment(text, 9)).toBe('kap');
    expect(dateiFragment(text, text.length)).toBeNull();
  });
});

describe('setzePfadEin (Plan 023 E7)', () => {
  it('ersetzt das Fragment durch den Pfad und setzt ein Leerzeichen dahinter', () => {
    const { text, cursor } = setzePfadEin('Lies @kap', 9, 'docs/kapitel-01.md');
    expect(text).toBe('Lies docs/kapitel-01.md ');
    expect(cursor).toBe(text.length);
  });

  it('laesst stehen, was hinter dem Cursor steht', () => {
    const eingabe = 'Lies @kap und fasse zusammen';
    const { text, cursor } = setzePfadEin(eingabe, 9, 'a.md');
    expect(text).toBe('Lies a.md  und fasse zusammen');
    // Der Cursor steht hinter dem eingesetzten Pfad, nicht am Zeilenende.
    expect(cursor).toBe('Lies a.md '.length);
  });

  it('tut nichts, wenn an der Stelle kein Fragment steht', () => {
    expect(setzePfadEin('nichts hier', 5, 'a.md')).toEqual({ text: 'nichts hier', cursor: 5 });
  });
});

describe('DateiMenue', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({
      data: {
        eintraege: [
          { pfad: 'docs/kapitel-01.md', name: 'kapitel-01.md', typ: 'datei' },
          { pfad: 'docs', name: 'docs', typ: 'ordner' },
          { pfad: 'kapitel-02.md', name: 'kapitel-02.md', typ: 'datei' },
        ],
      },
    });
  });

  it('zeigt nur Dateien, keine Ordner', async () => {
    render(
      <DateiMenue
        projectId="p1"
        fragment="kap"
        activeIndex={0}
        onTreffer={vi.fn()}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getAllByTestId('datei-menue-eintrag')).toHaveLength(2));
    expect(screen.queryByText('docs')).not.toBeInTheDocument();
  });

  it('meldet die Treffer nach oben, damit die Tastatur sie kennt', async () => {
    const onTreffer = vi.fn();
    render(
      <DateiMenue
        projectId="p1"
        fragment="kap"
        activeIndex={0}
        onTreffer={onTreffer}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />
    );
    await waitFor(() => expect(onTreffer).toHaveBeenCalled());
    expect(onTreffer.mock.calls.at(-1)?.[0]).toHaveLength(2);
  });

  it('waehlt mit der Maus über mousedown, nicht über click', async () => {
    // Ein click käme nach dem Blur der Textarea, und die Auswahl ginge
    // verloren, bevor sie ankommt.
    const onPick = vi.fn();
    render(
      <DateiMenue
        projectId="p1"
        fragment="kap"
        activeIndex={0}
        onTreffer={vi.fn()}
        onPick={onPick}
        onHover={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getAllByTestId('datei-menue-eintrag')).toHaveLength(2));
    fireEvent.mouseDown(screen.getAllByTestId('datei-menue-eintrag')[0]!);
    expect(onPick).toHaveBeenCalledWith({ pfad: 'docs/kapitel-01.md', name: 'kapitel-01.md' });
  });

  it('sagt es, wenn nichts gefunden wurde', async () => {
    get.mockResolvedValue({ data: { eintraege: [] } });
    render(
      <DateiMenue
        projectId="p1"
        fragment="gibtsnicht"
        activeIndex={0}
        onTreffer={vi.fn()}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('datei-menue-leer')).toBeInTheDocument());
  });

  it('laesst den Chat nicht rot werden, wenn die Suche scheitert', async () => {
    get.mockRejectedValue(new Error('weg'));
    render(
      <DateiMenue
        projectId="p1"
        fragment="kap"
        activeIndex={0}
        onTreffer={vi.fn()}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('datei-menue-leer')).toBeInTheDocument());
  });
});
