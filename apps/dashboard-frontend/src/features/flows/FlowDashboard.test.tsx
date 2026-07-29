/**
 * FlowDashboard Tests — „Ab Fehler wiederholen" (2026-07-29).
 *
 * Der Knopf erscheint NUR an fehlgeschlagenen Läufen eines Flows mit
 * deklarierter Schritt-Kette, ruft die Wiederholen-Route und springt in die
 * Detailansicht des neuen Laufs.
 */
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlowDashboard from './FlowDashboard';
import type { FlowDefinition, FlowRunSummary } from '@/types/flows';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get: apiGet, post: apiPost }) }));

const toastSuccess = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}));

// Die Detailansicht selbst (RunCard, SSE) ist hier nicht Gegenstand — nur,
// DASS sie mit der richtigen Lauf-ID geöffnet wird.
vi.mock('./FlowRunDetail', () => ({
  default: ({ runId }: { runId: number }) => <div data-testid="lauf-detail">Lauf {runId}</div>,
}));

function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const FLOW_MIT_SCHRITTEN: FlowDefinition = {
  name: 'kette',
  beschreibung: '',
  argumente: [],
  ordner: [],
  werkzeuge: ['subagent'],
  rollen: [
    {
      name: 'sucher',
      werkzeuge: [],
      ergebnis: { felder: ['fazit'], max_zeichen: 2000 },
      prompt: 'Suche.',
    },
  ],
  schritte: [{ name: 'suchen', typ: 'subagent', rolle: 'sucher', auftrag: 'x', iterationen: 1 }],
  grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10, max_tiefe: 2 },
  prompt: 'Fasse zusammen.',
};

const FLOW_OHNE_SCHRITTE: FlowDefinition = { ...FLOW_MIT_SCHRITTEN, schritte: [], rollen: [] };

function lauf(overrides: Partial<FlowRunSummary> = {}): FlowRunSummary {
  return {
    id: 5,
    flow_name: 'kette',
    conversation_id: null,
    status: 'fehler',
    steps_used: 3,
    created_at: '2026-07-29T09:00:00.000Z',
    finished_at: '2026-07-29T09:01:00.000Z',
    ...overrides,
  };
}

/** Verdrahtet api.get: Lauf-Liste + API-Schlüssel. */
function mitLaeufen(runs: FlowRunSummary[]) {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/flows/laeufe')) return Promise.resolve({ data: runs });
    if (url.startsWith('/v1/external/api-keys')) return Promise.resolve({ api_keys: [] });
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('fehlgeschlagener Lauf eines Schritt-Flows zeigt den Wiederholen-Knopf', async () => {
  mitLaeufen([lauf()]);
  render(
    <FlowDashboard name="kette" flow={FLOW_MIT_SCHRITTEN} onEdit={vi.fn()} onDelete={vi.fn()} />
  );
  expect(await screen.findByTestId('run-wiederholen')).toHaveTextContent('Ab Fehler wiederholen');
});

test('Klick startet den neuen Lauf über die Route und öffnet seine Detailansicht', async () => {
  const user = userEvent.setup();
  mitLaeufen([lauf()]);
  apiPost.mockResolvedValue({ data: { runId: 9 } });
  render(
    <FlowDashboard name="kette" flow={FLOW_MIT_SCHRITTEN} onEdit={vi.fn()} onDelete={vi.fn()} />
  );

  await user.click(await screen.findByTestId('run-wiederholen'));

  expect(apiPost).toHaveBeenCalledWith('/flows/laeufe/5/wiederholen', {});
  await waitFor(() => expect(screen.getByTestId('lauf-detail')).toHaveTextContent('Lauf 9'));
  expect(toastSuccess).toHaveBeenCalled();
});

test('kein Knopf an fertigen Läufen', async () => {
  mitLaeufen([lauf({ status: 'fertig' })]);
  render(
    <FlowDashboard name="kette" flow={FLOW_MIT_SCHRITTEN} onEdit={vi.fn()} onDelete={vi.fn()} />
  );
  expect(await screen.findByTestId('flow-run-row')).toBeInTheDocument();
  expect(screen.queryByTestId('run-wiederholen')).not.toBeInTheDocument();
});

test('kein Knopf, wenn der Flow keine Schritt-Kette hat', async () => {
  mitLaeufen([lauf()]);
  render(
    <FlowDashboard name="kette" flow={FLOW_OHNE_SCHRITTE} onEdit={vi.fn()} onDelete={vi.fn()} />
  );
  expect(await screen.findByTestId('flow-run-row')).toBeInTheDocument();
  expect(screen.queryByTestId('run-wiederholen')).not.toBeInTheDocument();
});
