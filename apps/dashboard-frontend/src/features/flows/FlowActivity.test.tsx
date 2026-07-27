/**
 * FlowActivity-Tests (Plan 013, B8): die Flow-Steuerung im Chat.
 * Zähler für laufende/geplante Flows, Aufklappen zeigt die Zeilen,
 * „Jetzt starten" reicht den Flow-Namen nach oben.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlowActivity from './FlowActivity';
import type { Flow, FlowSchedule } from '@/types/flows';

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const FLOWS: Flow[] = [{ name: 'recherche', beschreibung: '', argumente: [] }];

const SCHEDULE: FlowSchedule = {
  id: 1,
  flow_name: 'recherche',
  trigger_type: 'zeitplan',
  cron: '0 8 * * *',
  event_name: null,
  args: {},
  enabled: true,
  next_run_at: '2026-07-28T06:00:00.000Z',
  last_run_at: null,
  last_run_id: null,
  last_error: null,
  created_at: '2026-07-27T10:00:00.000Z',
  updated_at: '2026-07-27T10:00:00.000Z',
};

/** api.get nach Pfad beantworten: Auslöser-Liste vs. laufende Läufe. */
function routeGet({
  schedules = [],
  running = [],
}: {
  schedules?: FlowSchedule[];
  running?: unknown[];
}) {
  apiMock.get.mockImplementation((path: string) => {
    if (path.startsWith('/flows/zeitplaene')) return Promise.resolve({ data: schedules });
    if (path.startsWith('/flows/laeufe')) return Promise.resolve({ data: running });
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => vi.clearAllMocks());

test('ohne laufende/geplante Flows nur der Zeitplan-Knopf, keine Zeilen', async () => {
  routeGet({});
  wrap(<FlowActivity flows={FLOWS} onRunFlow={vi.fn()} />);
  await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: /Zeitplan/i })).toBeInTheDocument();
  expect(screen.queryByTestId('schedule-row')).not.toBeInTheDocument();
});

test('zeigt „1 geplant" und beim Aufklappen die Auslöser-Zeile', async () => {
  const user = userEvent.setup();
  routeGet({ schedules: [SCHEDULE] });
  wrap(<FlowActivity flows={FLOWS} onRunFlow={vi.fn()} />);

  await waitFor(() => expect(screen.getByText(/1 geplant/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /Flows/i }));
  const row = await screen.findByTestId('schedule-row');
  expect(row).toHaveTextContent('recherche');
  expect(row).toHaveTextContent(/täglich 8 Uhr/i);
});

test('„Jetzt starten" reicht den Flow-Namen nach oben', async () => {
  const user = userEvent.setup();
  const onRun = vi.fn();
  routeGet({ schedules: [SCHEDULE] });
  wrap(<FlowActivity flows={FLOWS} onRunFlow={onRun} />);

  await waitFor(() => expect(screen.getByText(/1 geplant/i)).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /Flows/i }));
  await screen.findByTestId('schedule-row');
  await user.click(screen.getByRole('button', { name: /recherche jetzt starten/i }));
  expect(onRun).toHaveBeenCalledWith('recherche', {});
});
