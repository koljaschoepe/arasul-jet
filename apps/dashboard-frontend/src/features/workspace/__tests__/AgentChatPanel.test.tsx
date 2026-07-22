import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgentChatPanel from '../llm/agentChat/AgentChatPanel';
import CompactMessage from '../llm/agentChat/CompactMessage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
  // Skill-Läufe (Plan 011, Schritt 15)
  getSkillRuns: vi.fn().mockReturnValue([]),
  registerSkillRun: vi.fn(),
  setChatSkillRuns: vi.fn(),
  installedModels: [
    { id: 'qwen3:8b', name: 'Qwen 3 8B', supports_thinking: true },
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B' },
  ],
  defaultModel: 'qwen3:8b',
  selectedModel: '',
  setSelectedModel: vi.fn(),
};
vi.mock('@/contexts/ChatContext', () => ({
  useChatContext: () => chatContext,
}));

// Skill-Menü (Plan 011, Schritt 13): der Panel liest die Skill-Liste (React Query)
// und zeigt Verwaltungs-Hinweise (Toast). Beides hier flach mocken, damit dieser
// Test keinen QueryClient-/ToastProvider braucht.
vi.mock('@/hooks/useSkills', () => ({
  useSkills: () => ({ skills: [], fehlerhaft: [], isLoading: false }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    chatScope: null,
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

  it('erstellt beim ersten Senden lazy einen Chat und sendet mit Auto-RAG', async () => {
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
    expect(call[2].useRAG).toBe(true);
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

  it('lädt einen bestehenden Panel-Chat aus localStorage', async () => {
    localStorage.setItem('arasul_panel_chat_id', '7');
    renderPanel();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/chats/7', { showError: false }));
    await waitFor(() => expect(screen.getByText('Testchat')).toBeInTheDocument());
    expect(chatContext.registerMessageCallback).toHaveBeenCalled();
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
              tool: 'dateien',
              params: { aktion: 'read', pfad: 'brief.md' },
              status: 'done',
              result: 'Inhalt',
            },
            { tool: 'rag', params: { frage: 'Kündigungsfrist' }, status: 'running' },
            { tool: 'terminal', params: { befehl: 'ls -la' }, status: 'done' },
          ],
        }}
      />
    );
    expect(screen.getByText('liest brief.md')).toBeInTheDocument();
    // Laufender Schritt bekommt das Ellipsis-Suffix
    expect(screen.getByText('sucht: Kündigungsfrist …')).toBeInTheDocument();
    expect(screen.getByText('führt aus: ls -la')).toBeInTheDocument();
    // Ergebnis eines Schritts ist einklappbar
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('liest brief.md'));
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
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
