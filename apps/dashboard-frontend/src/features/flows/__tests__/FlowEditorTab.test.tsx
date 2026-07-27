/**
 * FlowEditorTab Tests (Plan 012 Phase D, Schritte 10–11).
 *
 * Der zentrale Flow-Editor als Mitte-Tab (löst das frühere FlowDialog-Popup
 * ab). Ziel steht im `flowEditorStore`: `null` legt an, ein Name bearbeitet.
 * Anlegen (POST) → wechselt in den Bearbeiten-Modus des neuen Flows; Bearbeiten
 * (PUT, Name in der URL nicht im Body); Löschen (mit Rückfrage) schließt den Tab.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import FlowEditorTab from '../FlowEditorTab';
import type { FlowDefinition } from '@/types/flows';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiDel = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGet, post: apiPost, put: apiPut, del: apiDel }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const WERKZEUGE = [
  { name: 'rag_suche', verfuegbar: true },
  { name: 'dateien_schreiben', verfuegbar: true },
  { name: 'subagent', verfuegbar: true },
];

const RECHERCHE: FlowDefinition = {
  name: 'recherche',
  beschreibung: 'sucht im Netz',
  argumente: [{ name: 'thema', typ: 'freitext', beschreibung: 'Das Thema', pflicht: true }],
  ordner: [],
  werkzeuge: ['rag_suche'],
  rollen: [],
  schritte: [],
  grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10, max_tiefe: 2 },
  prompt: '# Recherche\n{{thema}}',
};

function renderTab(editName: string | null) {
  useFlowEditorStore.setState({ editName });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FlowEditorTab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useFlowEditorStore.setState({ editName: null });
  useWorkspaceStore.setState({ tabs: [], activeTabId: null });
  apiGet.mockImplementation((url: string) => {
    if (url === '/flows/werkzeuge') return Promise.resolve({ data: WERKZEUGE });
    if (url === '/flows/recherche') return Promise.resolve({ data: RECHERCHE });
    // Nach dem Anlegen wechselt der Tab in den Bearbeiten-Modus und lädt den
    // frisch gespeicherten Flow — der Server gibt eine vollständige Definition.
    if (url === '/flows/notiz') {
      return Promise.resolve({
        data: {
          name: 'notiz',
          beschreibung: '',
          argumente: [],
          ordner: [],
          werkzeuge: [],
          rollen: [],
          grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10 },
          prompt: 'Schreibe etwas.',
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
  apiPost.mockResolvedValue({ data: { datei: '---\n---\n# x' } });
  apiPut.mockResolvedValue({ data: {} });
  apiDel.mockResolvedValue({ deleted: true });
});

describe('Anlegen', () => {
  it('zeigt den Anlege-Titel und das Formular — Vorschau erst auf Wunsch, kein Löschen', async () => {
    const user = userEvent.setup();
    renderTab(null);
    expect(await screen.findByText('Neuer Flow')).toBeInTheDocument();
    expect(screen.getByTestId('flow-form')).toBeInTheDocument();
    // Das Formular ist die Hauptansicht: die Vorschau ist zunächst zu.
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
    // Der »Vorschau«-Schalter blendet sie ein.
    await user.click(screen.getByRole('button', { name: /Vorschau/ }));
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Löschen/ })).not.toBeInTheDocument();
  });

  it('Speichern schickt POST /flows und wechselt in den Bearbeiten-Modus', async () => {
    const user = userEvent.setup();
    renderTab(null);
    await screen.findByText('Neuer Flow');

    await user.type(screen.getByLabelText('Name'), 'notiz');
    await user.type(screen.getByLabelText('Prompt (Anweisung an das Modell)'), 'Schreibe etwas.');
    await user.click(screen.getByRole('button', { name: /Speichern/ }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/flows',
        expect.objectContaining({ name: 'notiz', prompt: 'Schreibe etwas.' }),
        { showError: false }
      )
    );
    expect(toast.success).toHaveBeenCalled();
    // Nach dem Anlegen zeigt der Tab den neuen Flow (Bearbeiten-Modus).
    await waitFor(() => expect(useFlowEditorStore.getState().editName).toBe('notiz'));
  });

  it('zeigt die Fehlermeldung des Servers, wenn Speichern scheitert', async () => {
    const user = userEvent.setup();
    apiPost.mockImplementation((url: string) => {
      if (url === '/flows')
        return Promise.reject(
          Object.assign(new Error('Flow „notiz" existiert bereits'), { status: 409 })
        );
      return Promise.resolve({ data: { datei: 'x' } });
    });
    renderTab(null);
    await screen.findByText('Neuer Flow');
    await user.type(screen.getByLabelText('Name'), 'notiz');
    await user.type(screen.getByLabelText('Prompt (Anweisung an das Modell)'), 'x');
    await user.click(screen.getByRole('button', { name: /Speichern/ }));
    expect(await screen.findByText('Flow „notiz" existiert bereits')).toBeInTheDocument();
  });
});

describe('Bearbeiten', () => {
  it('lädt den Flow, sperrt den Namen und bietet Löschen', async () => {
    renderTab('recherche');
    expect(await screen.findByText('Flow bearbeiten: /recherche')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('recherche'));
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Löschen/ })).toBeInTheDocument();
  });

  it('Speichern schickt PUT /flows/:name ohne Namen im Body', async () => {
    const user = userEvent.setup();
    renderTab('recherche');
    await screen.findByText('Flow bearbeiten: /recherche');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('recherche'));
    await user.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    const [url, body] = apiPut.mock.calls[0]!;
    expect(url).toBe('/flows/recherche');
    expect(body).not.toHaveProperty('name');
    expect(body).toMatchObject({ prompt: '# Recherche\n{{thema}}' });
  });

  it('Löschen fragt nach, schickt DELETE und schließt den Tab', async () => {
    const user = userEvent.setup();
    renderTab('recherche');
    await screen.findByText('Flow bearbeiten: /recherche');
    await user.click(screen.getByRole('button', { name: /Löschen/ }));
    const dialog = await screen.findByText('Flow löschen');
    const confirmScope = dialog.closest('[role="dialog"]') as HTMLElement;
    await user.click(within(confirmScope).getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(apiDel).toHaveBeenCalledWith('/flows/recherche', { showError: false })
    );
    await waitFor(() => expect(useFlowEditorStore.getState().editName).toBeNull());
  });
});
