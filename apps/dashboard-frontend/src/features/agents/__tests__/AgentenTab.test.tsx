/**
 * Tests für den Agenten-Bereich (Plan 010, Schritt 2).
 * useApi + useAuth gemockt; geprüft: Liste laden/rendern, Leerzustand,
 * Auswahl öffnet den Editor, „Neuer Agent" öffnet ein leeres Formular.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';
import type { ApiMethods } from '@/hooks/useApi';
import AgentenTab from '../AgentenTab';
import type { FlowAgent } from '../types';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
} satisfies ApiMethods;

vi.mock('@/hooks/useApi', () => ({ useApi: () => mockApi }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'kolja', role: 'user' } }),
}));

const AGENT: FlowAgent = {
  id: 1,
  name: 'Recherche',
  description: 'sucht',
  systemPrompt: 'Du bist Rechercheur',
  provider: 'ollama',
  model: 'qwen2.5:3b',
  tools: [],
  allowExternal: false,
  createdAt: 'a',
  updatedAt: 'b',
};

function renderTab() {
  return render(
    <ToastProvider>
      <AgentenTab />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: models list for the editor picker.
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/agents') return Promise.resolve({ data: [AGENT] });
    if (path === '/models/installed')
      return Promise.resolve({ models: [{ model_id: 'qwen2.5:3b' }] });
    return Promise.resolve({ data: [] });
  });
});

test('lädt und rendert die Agentenliste', async () => {
  renderTab();
  expect(await screen.findByText('Recherche')).toBeInTheDocument();
  expect(mockApi.get).toHaveBeenCalledWith('/agents', expect.anything());
});

test('Auswahl eines Agenten öffnet den Editor mit seinen Werten', async () => {
  renderTab();
  fireEvent.click(await screen.findByText('Recherche'));
  await waitFor(() => {
    expect(screen.getByDisplayValue('Recherche')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Du bist Rechercheur')).toBeInTheDocument();
  });
  // Editieren eines vorhandenen Agenten zeigt zusätzlich die Lauf-Ansicht.
  expect(screen.getByRole('button', { name: 'Ausführen' })).toBeInTheDocument();
});

test('„Neuer Agent" öffnet ein leeres Formular (Anlegen-Button)', async () => {
  renderTab();
  await screen.findByText('Recherche');
  fireEvent.click(screen.getByLabelText('Neuer Agent'));
  await waitFor(() => {
    expect(screen.getByText('Anlegen')).toBeInTheDocument();
  });
});

test('Leerzustand, wenn keine Agenten existieren', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/agents') return Promise.resolve({ data: [] });
    return Promise.resolve({ models: [] });
  });
  renderTab();
  expect(await screen.findByText(/Noch keine Agenten/)).toBeInTheDocument();
});
