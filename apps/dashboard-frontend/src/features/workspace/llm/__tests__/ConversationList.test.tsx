/**
 * ConversationList Tests (Plan 011, Schritt 20).
 * Vergangene Unterhaltungen wiederfinden: Suchfeld (→ /chats/search), letzte
 * Chats bei leerer Suche (→ /chats/recent), Auswahl und Umbenennen (→ PATCH).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConversationList from '../ConversationList';

const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGet, patch: apiPatch }),
}));

function renderList(onSelect = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ConversationList onSelect={onSelect} />
    </QueryClientProvider>
  );
  return onSelect;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/chats/recent')) {
      return Promise.resolve({ chats: [{ id: 1, title: 'Letzter Chat', updated_at: undefined }] });
    }
    if (url.startsWith('/chats/search')) {
      return Promise.resolve({ chats: [{ id: 42, title: 'Vertrag zusammenfassen' }] });
    }
    return Promise.resolve({ chats: [] });
  });
  apiPatch.mockResolvedValue({});
});

it('zeigt die letzten Chats, sobald der Verlauf geöffnet wird', async () => {
  renderList();
  await userEvent.click(screen.getByLabelText('Chat-Verlauf'));
  expect(await screen.findByText('Letzter Chat')).toBeInTheDocument();
});

it('sucht nach Titel und zeigt die Treffer', async () => {
  renderList();
  await userEvent.click(screen.getByLabelText('Chat-Verlauf'));
  await userEvent.type(screen.getByLabelText('Unterhaltungen durchsuchen'), 'Vertrag');
  expect(await screen.findByText('Vertrag zusammenfassen')).toBeInTheDocument();
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringContaining('/chats/search?q=Vertrag'),
      expect.anything()
    )
  );
});

it('wählt einen Chat aus', async () => {
  const onSelect = renderList();
  await userEvent.click(screen.getByLabelText('Chat-Verlauf'));
  await userEvent.click(await screen.findByText('Letzter Chat'));
  expect(onSelect).toHaveBeenCalledWith(1);
});

it('benennt einen Chat um (PATCH /chats/:id)', async () => {
  renderList();
  await userEvent.click(screen.getByLabelText('Chat-Verlauf'));
  await screen.findByText('Letzter Chat');
  await userEvent.click(screen.getByLabelText('Chat umbenennen'));
  const eingabe = screen.getByLabelText('Neuer Titel');
  await userEvent.clear(eingabe);
  await userEvent.type(eingabe, 'Neuer Name{Enter}');
  await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/chats/1', { title: 'Neuer Name' }));
});
