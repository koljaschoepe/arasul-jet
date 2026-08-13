/**
 * CompactMessage Tests — Agent-UX-Umbau (2026-08-02).
 *
 * Kernzusagen: (1) Schritte rendern als BAUM (Helfer-Schritt mit eingerückten
 * Kind-Schritten statt flacher Liste), (2) Datei-Karten tragen die
 * Änderungs-Badges neu/geändert/gelöscht, gelöschte sind nicht klickbar.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CompactMessage, { TodoLeiste } from './CompactMessage';
import type { ChatMessage } from '@/contexts/ChatContext';

vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get: vi.fn(), post: vi.fn() }) }));

function nachricht(teil: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    ...teil,
  } as ChatMessage;
}

describe('AgentSteps als Baum', () => {
  it('hängt Kind-Schritte eingerückt unter ihren Helfer-Schritt', () => {
    render(
      <CompactMessage
        isStreaming={true}
        message={nachricht({
          steps: [
            {
              id: 1,
              kind: 'subagent',
              tool: 'rechercheur',
              params: { auftrag: 'Sammle Fakten' },
              status: 'running',
              parentStepId: null,
            },
            {
              id: 2,
              kind: 'werkzeug',
              tool: 'web_suche',
              params: { frage: 'Jetson' },
              status: 'done',
              parentStepId: 1,
            },
            {
              id: 3,
              kind: 'werkzeug',
              tool: 'dateien_schreiben',
              params: { pfad: 'bericht.md' },
              status: 'done',
              parentStepId: null,
            },
          ],
        })}
      />
    );
    // Helfer-Zeile in Alltagssprache …
    expect(screen.getByText(/Helfer „rechercheur" arbeitet/)).toBeInTheDocument();
    // … mit dem inneren Werkzeug-Schritt als eingerücktem Kind.
    const substeps = screen.getByTestId('agent-substeps');
    expect(substeps).toHaveTextContent('sucht im Web: Jetson');
    // Der Wurzel-Schritt steht NICHT im Kind-Container.
    expect(substeps).not.toHaveTextContent('schreibt bericht.md');
    expect(screen.getByText('schreibt bericht.md')).toBeInTheDocument();
  });
});

describe('Datei-Karten mit Änderungs-Badges', () => {
  it('zeigt Badges und macht gelöschte Dateien nicht klickbar', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={nachricht({
          content: 'Fertig.',
          datei: [
            { art: 'projektdatei', project_id: 'p1', pfad: 'a.md', name: 'a.md', aenderung: 'neu' },
            {
              art: 'projektdatei',
              project_id: 'p1',
              pfad: 'b.md',
              name: 'b.md',
              aenderung: 'geloescht',
            },
          ] as ChatMessage['datei'],
        })}
      />
    );
    expect(screen.getByTestId('aenderungen-titel')).toHaveTextContent('2 Dateien');
    const badges = screen.getAllByTestId('datei-badge').map(b => b.textContent);
    expect(badges).toEqual(['Neu', 'Gelöscht']);
    const karten = screen.getAllByTestId('datei-karte');
    expect(karten[0]).toBeEnabled();
    expect(karten[1]).toBeDisabled();
  });
});

describe('TodoLeiste (feste Aufgaben-Leiste, Plan 019)', () => {
  it('zeigt den Zähler, listet Aufgaben und lässt sich einklappen', () => {
    render(
      <TodoLeiste
        collapsible
        testid="todo-leiste-unten"
        todos={[
          { text: 'Quellen lesen', status: 'fertig' },
          { text: 'Entwurf schreiben', status: 'laeuft' },
          { text: 'Prüfen', status: 'offen' },
        ]}
      />
    );
    expect(screen.getByTestId('todo-leiste-unten')).toBeInTheDocument();
    expect(screen.getByText('Aufgaben · 1/3 erledigt')).toBeInTheDocument();
    expect(screen.getByText('Entwurf schreiben')).toBeInTheDocument();
    // Kopfzeile ist der Auf/Zu-Schalter: einklappen versteckt die Liste.
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Entwurf schreiben')).not.toBeInTheDocument();
  });

  it('rendert nichts ohne Aufgaben', () => {
    const { container } = render(<TodoLeiste todos={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
