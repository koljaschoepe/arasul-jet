/**
 * CompactMessage Tests — Agent-UX-Umbau (2026-08-02).
 *
 * Kernzusagen: (1) Schritte rendern als BAUM (Helfer-Schritt mit eingerückten
 * Kind-Schritten statt flacher Liste), (2) Datei-Karten tragen die
 * Änderungs-Badges neu/geändert/gelöscht, gelöschte sind nicht klickbar.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CompactMessage, { TodoLeiste } from './CompactMessage';
import type { ChatMessage } from '@/contexts/ChatContext';

/**
 * Plan 023 E3: waehrend eines Laufs steht nur noch die Denkzeile da, die
 * Schrittliste liegt aufgeklappt darunter. Diese Hilfe oeffnet sie, damit die
 * Tests weiter das pruefen, worum es ihnen geht (den Inhalt der Liste), und
 * nicht die neue Faltung.
 */
function detailsAufklappen() {
  const zeile = screen.queryByTestId('denkzeile');
  if (!zeile) {
    return screen;
  }
  fireEvent.click(within(zeile).getByRole('button'));
  // Die Denkzeile wiederholt den juengsten Schritt in ihrer Kopfzeile. Wer
  // danach global sucht, findet ihn zweimal; deshalb gibt diese Hilfe den
  // aufgeklappten Bereich zurueck, in dem jeder Schritt genau einmal steht.
  return within(screen.getByTestId('denkzeile-details'));
}

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
    const details = detailsAufklappen();
    // Helfer-Zeile in Alltagssprache …
    expect(details.getByText(/Helfer „rechercheur" arbeitet/)).toBeInTheDocument();
    // … mit dem inneren Werkzeug-Schritt als eingerücktem Kind.
    const substeps = details.getByTestId('agent-substeps');
    expect(substeps).toHaveTextContent('sucht im Web: Jetson');
    // Der Wurzel-Schritt steht NICHT im Kind-Container.
    expect(substeps).not.toHaveTextContent('schreibt bericht.md');
    expect(details.getByText('schreibt bericht.md')).toBeInTheDocument();
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

  it('zeigt erledigte Aufgaben blau mit Haken, ohne Durchstreichen (Plan 022)', () => {
    render(<TodoLeiste todos={[{ text: 'Quellen lesen', status: 'fertig' }]} />);
    // Kein Durchstreichen mehr …
    const zeile = screen.getByText('Quellen lesen').closest('li');
    expect(zeile?.className).not.toContain('line-through');
    expect(zeile?.className).not.toContain('text-success');
    expect(zeile?.className).toContain('text-primary');
    // … dafür ein Haken.
    expect(screen.getByLabelText('erledigt')).toBeInTheDocument();
  });
});

describe('Denk-Ticker (Plan 022)', () => {
  it('weicht während des Laufs der Denkzeile (Plan 023 E3)', () => {
    // Bis zum 22.08.2026 lief hier der Denk-Ticker mit, neben der
    // Aufgabenliste und einer Statuszeile. Drei Anzeigen zugleich, alle drei
    // träge. Während des Laufs steht jetzt genau eine Zeile da; der
    // Gedankengang selbst bleibt erreichbar, aber eine Ebene tiefer.
    render(
      <CompactMessage
        isStreaming={true}
        message={nachricht({
          thinking: 'Let me check A.\nNow let me check B.',
          hasThinking: true,
          thinkingCollapsed: false,
        })}
      />
    );
    expect(screen.getByTestId('denkzeile-text')).toHaveTextContent('denkt nach');
    expect(screen.queryByTestId('denk-ticker')).not.toBeInTheDocument();
    // Der englische Denktext steht NICHT in der Zeile, die der Nutzer liest.
    expect(screen.getByTestId('denkzeile-text')).not.toHaveTextContent('let me check');
    const details = detailsAufklappen();
    expect(details.getByText(/Now let me check B\./)).toBeInTheDocument();
  });

  it('zeigt nach Abschluss „Nachgedacht · Ns" und Tokens/Sekunde', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={nachricht({
          content: 'Fertig.',
          thinking: 'Ausführlicher Gedankengang.',
          hasThinking: true,
          thinkingCollapsed: true,
          thinkingSeconds: 12,
          tokensPerSecond: 42,
        })}
      />
    );
    expect(screen.getByTestId('denk-ticker')).toHaveTextContent('Nachgedacht · 12s');
    expect(screen.getByTestId('tokens-pro-sekunde')).toHaveTextContent('42 tok/s');
  });

  it('zeigt Tokens/Sekunde auch ohne Denkphase', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={nachricht({ content: 'Antwort.', tokensPerSecond: 55 })}
      />
    );
    expect(screen.getByTestId('tokens-pro-sekunde')).toHaveTextContent('55 tok/s');
  });
});

/**
 * Plan 023 E4: Dauer und Tempo je Antwort, an EINER Stelle.
 *
 * Vorher zeigte der Denk-Ticker die Tokens je Sekunde, wenn es eine Denkphase
 * gab, und eine eigene Zeile sonst. Die Gesamtdauer wäre damit je nach Modell
 * mal da und mal weg gewesen.
 */
describe('Lauf-Metrik (Plan 023 E4)', () => {
  it('zeigt Gesamtdauer und Tempo nebeneinander', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={nachricht({ content: 'Fertig.', tokensPerSecond: 42, durationMs: 84_000 })}
      />
    );
    const metrik = screen.getByTestId('tokens-pro-sekunde');
    expect(metrik).toHaveTextContent('84 s');
    expect(metrik).toHaveTextContent('42 tok/s');
  });

  it('zeigt die Dauer auch mit Denkphase, wo sie vorher verschwand', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={nachricht({
          content: 'Fertig.',
          thinking: 'Gedankengang.',
          hasThinking: true,
          thinkingCollapsed: true,
          thinkingSeconds: 12,
          tokensPerSecond: 42,
          durationMs: 125_000,
        })}
      />
    );
    expect(screen.getByTestId('lauf-dauer')).toHaveTextContent('2:05 min');
    expect(screen.getByTestId('denk-ticker')).toHaveTextContent('Nachgedacht · 12s');
  });

  it('zeigt nichts, solange keine der beiden Zahlen da ist', () => {
    render(<CompactMessage isStreaming={false} message={nachricht({ content: 'Kurz.' })} />);
    expect(screen.queryByTestId('tokens-pro-sekunde')).not.toBeInTheDocument();
  });

  it('zeigt während des Laufs keine Endzahlen', () => {
    render(
      <CompactMessage
        isStreaming
        message={nachricht({ content: 'Halb', tokensPerSecond: 42, durationMs: 5000 })}
      />
    );
    expect(screen.queryByTestId('tokens-pro-sekunde')).not.toBeInTheDocument();
  });
});

/**
 * Plan 023 E8: die Quellen des Agent-Pfads.
 *
 * Der leere Chat verspricht „Antworten kommen mit Quellen aus deinen
 * Dokumenten". `message.sources` füllt nur die alte RAG-Pipeline; im
 * Agent-Modus, dem Normalfall, stand dort nichts.
 */
describe('Quellen aus dem Agent-Lauf (Plan 023 E8)', () => {
  it('nennt Datei und Stelle nach einem Treffer', () => {
    render(
      <CompactMessage
        isStreaming={false}
        projectId="p1"
        message={nachricht({
          content: 'Ein Switch verbindet Geräte im LAN.',
          steps: [
            {
              id: 1,
              tool: 'rag_suche',
              params: { frage: 'Switch' },
              status: 'done',
              result: 'Gefundene Stellen:\n1. [handbuch.md] Ein Switch verbindet Geräte im LAN.',
            },
          ],
        })}
      />
    );
    fireEvent.click(screen.getByTestId('quellen-schalter'));
    const liste = screen.getByTestId('quellen-liste');
    expect(liste).toHaveTextContent('handbuch.md');
    expect(liste).toHaveTextContent('Ein Switch verbindet Geräte im LAN.');
  });

  it('sagt bei erfolgloser Suche, dass nichts gefunden wurde, und wonach', () => {
    render(
      <CompactMessage
        isStreaming={false}
        projectId="p1"
        message={nachricht({
          content: 'Dazu weiß ich nichts aus deinen Unterlagen.',
          steps: [
            {
              id: 1,
              tool: 'rag_suche',
              params: { frage: 'Quartalszahlen' },
              status: 'done',
              result: 'Nichts gefunden, die Wissensbasis enthaelt keine passenden Stellen.',
            },
          ],
        })}
      />
    );
    const zeile = screen.getByTestId('quellen-leer');
    expect(zeile).toHaveTextContent('nichts Passendes gefunden');
    expect(zeile).toHaveTextContent('Quartalszahlen');
  });

  it('schweigt, wenn der Lauf gar nicht in Dokumenten gesucht hat', () => {
    render(<CompactMessage isStreaming={false} message={nachricht({ content: 'Guten Tag.' })} />);
    expect(screen.queryByTestId('quellen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quellen-leer')).not.toBeInTheDocument();
  });

  it('zeigt waehrend des Laufs noch keine Quellen', () => {
    render(
      <CompactMessage
        isStreaming
        message={nachricht({
          steps: [
            {
              id: 1,
              tool: 'rag_suche',
              params: { frage: 'x' },
              status: 'done',
              result: 'Nichts gefunden.',
            },
          ],
        })}
      />
    );
    expect(screen.queryByTestId('quellen-leer')).not.toBeInTheDocument();
  });
});
