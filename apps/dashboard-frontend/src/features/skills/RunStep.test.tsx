/**
 * RunStep Tests (Plan 011, Schritt 15).
 * Kurzfassung des Auftrags je Art, Dauer aus Zeitstempeln, Aufklappen zeigt
 * Auftrag/Ergebnis/Rohdaten und fragt die Rohdaten genau einmal nach.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunStep, { stepDauer, stepLabel } from './RunStep';
import type { SkillRunStep } from '@/hooks/useSkillRun';

const werkzeug = (
  name: string,
  input: unknown,
  extra: Partial<SkillRunStep> = {}
): SkillRunStep => ({
  kind: 'werkzeug',
  name,
  input,
  status: 'fertig',
  ...extra,
});

describe('stepLabel', () => {
  test('Datei-Werkzeug nennt Aktion und Pfad', () => {
    expect(stepLabel(werkzeug('dateien', { aktion: 'read', pfad: '/berichte/q1.md' }))).toBe(
      'liest /berichte/q1.md'
    );
    expect(stepLabel(werkzeug('dateien', { aktion: 'write', pfad: '/out.txt' }))).toBe(
      'schreibt /out.txt'
    );
  });

  test('RAG- und Web-Werkzeug zeigen die Suchanfrage', () => {
    expect(stepLabel(werkzeug('rag', { frage: 'Umsatz 2025' }))).toBe('sucht: Umsatz 2025');
    expect(stepLabel(werkzeug('web', { query: 'Wetter' }))).toBe('Web: Wetter');
  });

  test('Subagent nennt Rolle und Auftrag', () => {
    const s: SkillRunStep = {
      kind: 'subagent',
      name: 'leser',
      input: { auftrag: 'Kapitel 3 lesen' },
      status: 'laeuft',
    };
    expect(stepLabel(s)).toBe('leser: Kapitel 3 lesen');
  });

  test('Modell-Antwort und Hinweis haben eigene Kurzfassungen', () => {
    expect(stepLabel({ kind: 'modell', name: '', input: {}, status: 'fertig' })).toBe(
      'Modell-Antwort'
    );
    expect(
      stepLabel({ kind: 'hinweis', name: '', input: { text: 'Zeitlimit' }, status: 'fertig' })
    ).toBe('Zeitlimit');
  });
});

describe('stepDauer', () => {
  test('nur mit beiden Zeitstempeln, als s bzw. ms', () => {
    expect(
      stepDauer(
        werkzeug(
          'rag',
          {},
          { created_at: '2026-07-22T10:00:00.000Z', finished_at: '2026-07-22T10:00:01.500Z' }
        )
      )
    ).toBe('1,5 s');
    expect(
      stepDauer(
        werkzeug(
          'rag',
          {},
          { created_at: '2026-07-22T10:00:00.000Z', finished_at: '2026-07-22T10:00:00.340Z' }
        )
      )
    ).toBe('340 ms');
  });

  test('ohne Endzeitstempel leer', () => {
    expect(stepDauer(werkzeug('rag', {}, { created_at: '2026-07-22T10:00:00.000Z' }))).toBe('');
  });
});

describe('RunStep · Aufklappen', () => {
  test('zeigt Auftrag und Ergebnis erst nach dem Aufklappen und lädt Rohdaten einmal', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const step = werkzeug(
      'rag',
      { frage: 'Umsatz' },
      { output: 'Der Umsatz lag bei 1 Mio.', position: 0 }
    );
    const { rerender } = render(<RunStep step={step} onExpand={onExpand} />);

    // Zusammengeklappt: kein Detail sichtbar.
    expect(screen.queryByTestId('run-step-detail')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('run-step-detail')).toBeInTheDocument();
    expect(screen.getByText('Der Umsatz lag bei 1 Mio.')).toBeInTheDocument();
    // Rohdaten noch nicht geladen → Platzhaltertext.
    expect(screen.getByText('keine Rohdaten')).toBeInTheDocument();

    // Karte reicht die Rohdaten nach.
    rerender(<RunStep step={step} onExpand={onExpand} rawOutput="Voller Seitentext …" />);
    expect(screen.getByText('Voller Seitentext …')).toBeInTheDocument();
  });
});
