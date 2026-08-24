import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgentChatPanel from '../llm/agentChat/AgentChatPanel';
import CompactMessage from '../llm/agentChat/CompactMessage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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

/** Der Panel bindet über die ConversationList (Schritt 20) React Query ein. */
function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgentChatPanel />
    </QueryClientProvider>
  );
}

const apiMock = {
  get: vi.fn((url: string) => {
    if (url === '/sandbox/projects') {
      return Promise.resolve({ projects: [{ id: 'p-uuid', slug: 'mein-ws' }] });
    }
    return Promise.resolve({ chat: { title: 'Testchat' } });
  }),
  post: vi.fn().mockResolvedValue({ chat: { id: 42 } }),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const sendMessage = vi.fn();
const chatContext = {
  sendMessage,
  cancelJob: vi.fn(),
  loadMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
  checkActiveJobs: vi.fn().mockResolvedValue(null),
  reconnectToJob: vi.fn(),
  registerMessageCallback: vi.fn(),
  unregisterMessageCallback: vi.fn(),
  getBackgroundMessages: vi.fn().mockReturnValue(null),
  getBackgroundLoading: vi.fn().mockReturnValue(false),
  clearBackgroundState: vi.fn(),
  hasActiveStream: vi.fn().mockReturnValue(false),
  // Flow-Läufe (Plan 011, Schritt 15)
  getFlowRuns: vi.fn().mockReturnValue([]),
  registerFlowRun: vi.fn(),
  setChatFlowRuns: vi.fn(),
  installedModels: [
    { id: 'qwen3:8b', name: 'Qwen 3 8B', supports_thinking: true },
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B' },
  ],
  defaultModel: 'qwen3:8b',
  selectedModel: '',
  setSelectedModel: vi.fn(),
  globalQueue: { pending_count: 0, processing: null, queue: [] },
};
vi.mock('@/contexts/ChatContext', () => ({
  useChatContext: () => chatContext,
  // Reale Hilfsfunktion (kein Hook): normalisiert datei (Objekt|Liste) → Liste.
  dateiListe: (datei: unknown) => (!datei ? [] : Array.isArray(datei) ? datei : [datei]),
}));

// Flow-Menü (Plan 011, Schritt 13): der Panel liest die Flow-Liste (React Query)
// und zeigt Verwaltungs-Hinweise (Toast). Beides hier flach mocken, damit dieser
// Test keinen QueryClient-/ToastProvider braucht.
vi.mock('@/hooks/useFlows', () => ({
  useFlows: () => ({ flows: [], fehlerhaft: [], isLoading: false }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    chatScope: null,
    chatDateiZiel: null,
  });
}

describe('AgentChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    localStorage.clear();
  });

  it('zeigt den leeren Zustand mit Composer und Maskottchen', () => {
    renderPanel();
    expect(screen.getByText('Frag dein Unternehmenswissen.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nachricht an die KI')).toBeInTheDocument();
    // Maskottchen sichtbar (Statuszeile oben + großes Bild im leeren Zustand)
    expect(screen.getAllByTestId('chat-mascot').length).toBeGreaterThanOrEqual(1);
    // Keine RAG-/Thinking-Toggles mehr
    expect(screen.queryByText(/\bRAG\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Thinking/i)).not.toBeInTheDocument();
  });

  it('erstellt beim ersten Senden lazy einen Chat und sendet im Agent-Modus', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Nachricht an die KI'), {
      target: { value: 'Was steht im Handbuch?' },
    });
    fireEvent.click(screen.getByLabelText('Senden'));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/chats', {}));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const call = sendMessage.mock.calls[0]!;
    expect(call[0]).toBe('42');
    expect(call[1]).toBe('Was steht im Handbuch?');
    // Agent-Modus (2026-07-28): Werkzeugschleife statt Client-RAG-Vorlauf.
    expect(call[2].agent).toBe(true);
    expect(call[2].useThinking).toBe(true); // Default-Modell unterstützt Thinking
  });

  it('nutzt den Ordner-Scope als selectedSpaces und zeigt den Chip', async () => {
    useWorkspaceStore.setState({
      chatScope: { spaceIds: ['s1', 's2'], label: 'Marketing' },
    });
    renderPanel();
    expect(screen.getByText('Marketing')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nachricht an die KI'), {
      target: { value: 'Kampagnen?' },
    });
    fireEvent.click(screen.getByLabelText('Senden'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0]![2].selectedSpaces).toEqual(['s1', 's2']);
  });

  it('Ordner-Drop aus dem Ein-Baum-Explorer setzt Speicherziel UND Chat-Scope', () => {
    renderPanel();
    // Der Explorer setzt beim Ordner-Drag beide Payloads: das Pfad-Ziel
    // (Ablage) und den Wissens-Scope (space_ids des Ordner-Teilbaums).
    const data: Record<string, string> = {
      'application/x-arasul-ablage': JSON.stringify({
        projectId: 'p1',
        pfad: 'docs',
        name: 'docs',
        typ: 'ordner',
      }),
      'application/x-arasul-scope': JSON.stringify({
        spaceIds: ['ks-1', 'ks-2'],
        label: 'docs',
      }),
    };
    fireEvent.drop(screen.getByTestId('agent-chat-panel'), {
      dataTransfer: {
        files: [] as unknown as FileList,
        types: Object.keys(data),
        getData: (type: string) => data[type] ?? '',
      } as unknown as DataTransfer,
    });
    expect(useWorkspaceStore.getState().chatDateiZiel).toEqual({
      projectId: 'p1',
      pfad: 'docs',
      label: 'docs',
    });
    expect(useWorkspaceStore.getState().chatScope).toEqual({
      spaceIds: ['ks-1', 'ks-2'],
      label: 'docs',
    });
  });

  it('lädt einen bestehenden Panel-Chat aus localStorage', async () => {
    localStorage.setItem('arasul_panel_chat_id', '7');
    renderPanel();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/chats/7', { showError: false }));
    await waitFor(() => expect(screen.getByText('Testchat')).toBeInTheDocument());
    expect(chatContext.registerMessageCallback).toHaveBeenCalled();
  });

  it('zeigt die Warteschlange im Header, wenn ein Lauf läuft und Aufträge warten', async () => {
    localStorage.setItem('arasul_panel_chat_id', '7');
    chatContext.getBackgroundLoading.mockReturnValue(true);
    chatContext.globalQueue = { pending_count: 3, processing: null, queue: [] };
    try {
      renderPanel();
      await waitFor(() =>
        expect(screen.getByTestId('queue-hinweis')).toHaveTextContent('Warteschlange: 3 Aufträge')
      );
    } finally {
      chatContext.getBackgroundLoading.mockReturnValue(false);
      chatContext.globalQueue = { pending_count: 0, processing: null, queue: [] };
    }
  });

  it('zeigt KEINE Warteschlange bei nur einem wartenden Auftrag', async () => {
    localStorage.setItem('arasul_panel_chat_id', '7');
    chatContext.getBackgroundLoading.mockReturnValue(true);
    chatContext.globalQueue = { pending_count: 1, processing: null, queue: [] };
    try {
      renderPanel();
      // Plan 023 E5: der Kopf traegt den Chatnamen, nicht den Zustand. Bei
      // einem einzigen wartenden Auftrag erscheint kein Warteschlangenhinweis.
      await waitFor(() => expect(screen.getByText('Neuer Chat')).toBeInTheDocument());
      expect(screen.queryByTestId('queue-hinweis')).not.toBeInTheDocument();
    } finally {
      chatContext.getBackgroundLoading.mockReturnValue(false);
      chatContext.globalQueue = { pending_count: 0, processing: null, queue: [] };
    }
  });
});

describe('CompactMessage', () => {
  beforeEach(resetStore);

  it('rendert Quellen-Footer und öffnet Dokument-Tab', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={{
          role: 'assistant',
          content: 'Die Frist beträgt 3 Monate.',
          sources: [
            { document_name: 'MSA.pdf', document_id: 'd1', space_name: 'Verträge' },
            { document_name: 'MSA.pdf', document_id: 'd1' }, // Duplikat → 1 Chip
          ],
        }}
      />
    );
    fireEvent.click(screen.getByText('1 Quelle'));
    fireEvent.click(screen.getByText('MSA.pdf'));
    const tabs = useWorkspaceStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ type: 'document', documentId: 'd1' });
  });

  it('zeigt lange Quellen-Dateinamen vollständig (umbrechend, nicht abgeschnitten)', () => {
    const longName = 'Sehr-langer-Dateiname-Quartalsbericht-2026-Q3-final-v7.pdf';
    render(
      <CompactMessage
        isStreaming={false}
        message={{
          role: 'assistant',
          content: 'Antwort',
          sources: [{ document_name: longName, document_id: 'd9' }],
        }}
      />
    );
    fireEvent.click(screen.getByText('1 Quelle'));
    const label = screen.getByText(longName);
    // Vollständig lesbar: kein truncate-Clip, sondern Umbruch
    expect(label).not.toHaveClass('truncate');
    expect(label.className).toMatch(/break-words/);
  });

  it('rendert Agenten-Werkzeugschritte inkrementell mit deutschen Beschriftungen', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          agent: 'texter',
          steps: [
            {
              tool: 'dateien_lesen',
              params: { aktion: 'read', pfad: 'brief.md' },
              status: 'done',
              result: 'Inhalt',
            },
            { tool: 'rag_suche', params: { frage: 'Kündigungsfrist' }, status: 'running' },
            { tool: 'dateien_schreiben', params: { pfad: 'angebot.html' }, status: 'done' },
          ],
        }}
      />
    );
    detailsAufklappen();
    expect(screen.getByText('liest brief.md')).toBeInTheDocument();
    // Laufender Schritt bekommt das Ellipsis-Suffix
    expect(screen.getByText('sucht im Wissen: Kündigungsfrist …')).toBeInTheDocument();
    expect(screen.getByText('schreibt angebot.html')).toBeInTheDocument();
    // Ergebnis eines Schritts ist einklappbar
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('liest brief.md'));
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('rendert die Aufgaben als gruppierte Zeilen (Zählerkopf + Status als Text + Farbe)', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          todos: [
            { text: 'Quellen lesen', status: 'fertig' },
            { text: 'Entwurf schreiben', status: 'laeuft' },
            { text: 'Prüfen', status: 'offen' },
          ],
        }}
      />
    );
    detailsAufklappen();
    // Kurz-Zählerkopf im Verlauf (die feste Leiste unten lebt im Panel).
    expect(screen.getByTestId('todo-liste')).toBeInTheDocument();
    expect(screen.getByText('Aufgaben · 1/3 erledigt')).toBeInTheDocument();
    // Jede Aufgabe ist eine Gruppen-Zeile; Status als Marker + Farbe (Plan 022):
    // fertig = Accent-Blau + Haken (KEIN Durchstreichen), läuft im Akzent, offen
    // gedämpft. Die Farbe sitzt am umschließenden Span des Textes.
    expect(screen.getAllByTestId('task-group')).toHaveLength(3);
    const fertigZeile = screen.getByText('Quellen lesen').parentElement as HTMLElement;
    expect(fertigZeile.className).not.toMatch(/line-through/);
    expect(fertigZeile.className).toMatch(/text-primary/);
    expect(screen.getByLabelText('erledigt')).toBeInTheDocument();
    expect((screen.getByText('Entwurf schreiben').parentElement as HTMLElement).className).toMatch(
      /text-primary/
    );
    expect((screen.getByText('Prüfen').parentElement as HTMLElement).className).toMatch(
      /text-muted-foreground/
    );
  });

  it('gruppiert Schritte unter ihrer Aufgabe (task_index) und faltet fertige Aufgaben ein', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          todos: [
            { text: 'Quellen lesen', status: 'fertig' },
            { text: 'Entwurf schreiben', status: 'laeuft' },
          ],
          steps: [
            {
              id: 1,
              tool: 'dateien_lesen',
              params: { aktion: 'read', pfad: 'quelle.md' },
              status: 'done',
              taskIndex: 0,
            },
            {
              id: 2,
              tool: 'dateien_schreiben',
              params: { pfad: 'entwurf.md' },
              status: 'running',
              taskIndex: 1,
            },
          ],
        }}
      />
    );
    detailsAufklappen();
    // Aufgabe 0 ist fertig → eingeklappt: ihr Schritt „liest quelle.md" ist
    // zunächst versteckt, bis man die Aufgabe aufklappt.
    expect(screen.queryByText('liest quelle.md')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Quellen lesen'));
    expect(screen.getByText('liest quelle.md')).toBeInTheDocument();
    // Aufgabe 1 läuft → aufgeklappt: der laufende Schritt ist direkt sichtbar.
    expect(screen.getByText('schreibt entwurf.md …')).toBeInTheDocument();
  });

  it('parst den persistierten todos-Schritt und zeigt ihn NICHT doppelt als Schritt-Zeile', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={{
          role: 'assistant',
          content: 'Fertig.',
          steps: [
            { tool: 'dateien_schreiben', params: { pfad: 'plan.md' }, status: 'done' },
            {
              kind: 'todos',
              tool: 'aufgaben',
              result: '- [x] Quellen lesen\n- [~] Entwurf schreiben\n- [ ] Prüfen',
              status: 'done',
            },
          ],
        }}
      />
    );
    expect(screen.getByText('Aufgaben · 1/3 erledigt')).toBeInTheDocument();
    expect(screen.getByText('Entwurf schreiben')).toBeInTheDocument();
    // Schritte ohne task_index (Alt-Nachrichten / Vorbereitung) falten wie der
    // flache Pfad zu „N Schritte"; der todos-Schritt ist KEINE Schritt-Zeile.
    fireEvent.click(screen.getByTestId('agent-steps-toggle'));
    expect(screen.getByText('schreibt plan.md')).toBeInTheDocument();
    expect(screen.queryByText('aktualisiert die Aufgabenliste')).not.toBeInTheDocument();
  });

  it('ordnet Schritte mit ungültigem task_index der Vorbereitung zu (nie verschluckt)', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          todos: [{ text: 'Nur eine Aufgabe', status: 'laeuft' }],
          steps: [
            // Index 7 zeigt nach dem Umschreiben der Liste ins Leere → Vorbereitung.
            {
              id: 1,
              tool: 'web_suche',
              params: { frage: 'Fakten' },
              status: 'done',
              taskIndex: 7,
            },
          ],
        }}
      />
    );
    detailsAufklappen();
    // Läuft (isStreaming) → Vorbereitung flach sichtbar, Schritt geht nicht verloren.
    expect(screen.getByText('sucht im Web: Fakten')).toBeInTheDocument();
  });

  it('verschachtelt Subagent-Kinder unter ihrem Schritt innerhalb der Aufgabe', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          todos: [{ text: 'Recherche', status: 'laeuft' }],
          steps: [
            {
              id: 1,
              kind: 'subagent',
              tool: 'rechercheur',
              params: { auftrag: 'Quellen finden' },
              status: 'running',
              taskIndex: 0,
            },
            {
              id: 2,
              tool: 'web_suche',
              params: { frage: 'Marktzahlen' },
              status: 'done',
              parentStepId: 1,
            },
          ],
        }}
      />
    );
    const details = detailsAufklappen();
    // Der Subagent hängt unter der Aufgabe, sein Werkzeug-Schritt eingerückt darunter.
    expect(details.getByText(/Helfer „rechercheur"/)).toBeInTheDocument();
    expect(details.getByTestId('agent-substeps')).toBeInTheDocument();
    expect(details.getByText('sucht im Web: Marktzahlen')).toBeInTheDocument();
  });

  it('beschriftet die neuen Werkzeuge dateien_bearbeiten und dateien_anhaengen', () => {
    render(
      <CompactMessage
        isStreaming
        message={{
          role: 'assistant',
          content: '',
          steps: [
            { tool: 'dateien_bearbeiten', params: { pfad: 'brief.md' }, status: 'done' },
            { tool: 'dateien_anhaengen', params: { pfad: 'bericht.md' }, status: 'running' },
          ],
        }}
      />
    );
    detailsAufklappen();
    expect(screen.getByText('ändert brief.md')).toBeInTheDocument();
    expect(screen.getByText('ergänzt bericht.md …')).toBeInTheDocument();
  });

  it('zeigt Thinking als einklappbare Zeile', () => {
    render(
      <CompactMessage
        isStreaming={false}
        message={{ role: 'assistant', content: 'Antwort', thinking: 'Überlege …' }}
      />
    );
    expect(screen.getByText('Gedankengang')).toBeInTheDocument();
    expect(screen.queryByText('Überlege …')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Gedankengang'));
    expect(screen.getByText('Überlege …')).toBeInTheDocument();
  });
});

/**
 * Plan 023 E6: mehrere Dateien und Ordner in den Chat ziehen.
 *
 * Gemeldet war, dass mehrere Dateien nacheinander „nicht zuverlässig"
 * funktionieren. Gemessen im Code war es eindeutig: `attachedFile` war EIN
 * Feld, und `handleDrop` rief `pickFile` in einer Schleife. Jeder Aufruf
 * überschrieb den vorigen, und übrig blieb die letzte Datei.
 */
describe('Dateien in den Chat ziehen (Plan 023 E6)', () => {
  beforeEach(resetStore);

  function datei(name: string, inhalt = 'x') {
    return new File([inhalt], name, { type: 'text/plain' });
  }

  function ziehen(dateien: File[]) {
    const panel = screen.getByTestId('agent-chat-panel');
    fireEvent.drop(panel, {
      dataTransfer: { files: dateien, getData: () => '', types: ['Files'] },
    });
  }

  it('haengt zwei Dateien aus EINEM Zug als zwei Anlagen an', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('agent-chat-panel')).toBeInTheDocument());
    ziehen([datei('eins.md'), datei('zwei.md')]);
    await waitFor(() => expect(screen.getAllByTestId('composer-chip')).toHaveLength(2));
  });

  it('ergibt aus drei Vorgaengen mit je zwei Dateien sechs Anlagen', async () => {
    // Genau die Abnahme aus dem Plan.
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('agent-chat-panel')).toBeInTheDocument());
    ziehen([datei('a1.md'), datei('a2.md')]);
    ziehen([datei('b1.md'), datei('b2.md')]);
    ziehen([datei('c1.md'), datei('c2.md')]);
    await waitFor(() => expect(screen.getAllByTestId('composer-chip')).toHaveLength(6));
  });

  it('nimmt dieselbe Datei nicht zweimal', async () => {
    // Wer einen Ordner zweimal hineinzieht, will nicht zwanzig doppelte
    // Anlagen.
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('agent-chat-panel')).toBeInTheDocument());
    ziehen([datei('gleich.md', 'inhalt')]);
    ziehen([datei('gleich.md', 'inhalt')]);
    await waitFor(() => expect(screen.getAllByTestId('composer-chip')).toHaveLength(1));
  });

  it('laesst jede Anlage einzeln entfernen', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('agent-chat-panel')).toBeInTheDocument());
    ziehen([datei('eins.md'), datei('zwei.md'), datei('drei.md')]);
    await waitFor(() => expect(screen.getAllByTestId('composer-chip')).toHaveLength(3));
    const chips = screen.getAllByTestId('composer-chip');
    fireEvent.click(within(chips[1]!).getByRole('button', { name: /entfernen/i }));
    await waitFor(() => expect(screen.getAllByTestId('composer-chip')).toHaveLength(2));
    const uebrig = screen.getAllByTestId('composer-chip').map(c => c.textContent);
    expect(uebrig.join(' ')).toContain('eins.md');
    expect(uebrig.join(' ')).toContain('drei.md');
    expect(uebrig.join(' ')).not.toContain('zwei.md');
  });
});
