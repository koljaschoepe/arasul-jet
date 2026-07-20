/**
 * Tests der Flüsse-Ansicht (Plan 010, Schritt 5).
 * useApi, der (React-Flow-)Canvas und der SSE-Helfer sind gemockt — geprüft
 * wird die Orchestrierung: Liste laden, Leerzustand, „Neuer Fluss" anlegen &
 * auswählen (Canvas mountet). Der Canvas selbst wird live auf dem Gerät geprüft.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';
import type { ApiMethods } from '@/hooks/useApi';
import FlowsView from '../FlowsView';
import type { Flow } from '../types';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
} satisfies ApiMethods;

vi.mock('@/hooks/useApi', () => ({ useApi: () => mockApi }));
vi.mock('../canvas/FlowCanvas', () => ({ default: () => <div data-testid="flow-canvas" /> }));
vi.mock('../runFlowStream', () => ({
  runFlowStream: () => ({ handle: { cancel: vi.fn() }, done: Promise.resolve() }),
}));

const FLOW: Flow = {
  id: 1,
  name: 'Mein Fluss',
  description: '',
  graph: { nodes: [], edges: [] },
  scheduleCron: null,
  hasRunToken: false,
  createdAt: 'a',
  updatedAt: 'b',
};

function renderView() {
  return render(
    <ToastProvider>
      <FlowsView />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/agents/flows') return Promise.resolve({ data: [FLOW] });
    if (path === '/agents') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

test('lädt und rendert die Fluss-Liste', async () => {
  renderView();
  expect(await screen.findByText('Mein Fluss')).toBeInTheDocument();
  expect(mockApi.get).toHaveBeenCalledWith('/agents/flows', expect.anything());
  expect(mockApi.get).toHaveBeenCalledWith('/agents', expect.anything());
});

test('Auswahl eines Flusses mountet den Canvas', async () => {
  renderView();
  fireEvent.click(await screen.findByText('Mein Fluss'));
  await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeInTheDocument());
});

test('„Neuer Fluss" legt an (POST) und wählt ihn aus', async () => {
  mockApi.post.mockResolvedValue({ data: { ...FLOW, id: 2, name: 'Neuer Fluss' } });
  renderView();
  await screen.findByText('Mein Fluss');
  fireEvent.click(screen.getByLabelText('Neuer Fluss'));
  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith(
      '/agents/flows',
      expect.objectContaining({ name: 'Neuer Fluss' })
    );
    expect(screen.getByTestId('flow-canvas')).toBeInTheDocument();
  });
});

test('Leerzustand ohne Flüsse', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/agents/flows') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  renderView();
  expect(await screen.findByText(/Verzweigte Flüsse/)).toBeInTheDocument();
});
