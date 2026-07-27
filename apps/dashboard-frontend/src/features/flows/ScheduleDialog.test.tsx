/**
 * ScheduleDialog-Tests (Plan 013, B8): den Auslöser-Dialog.
 * Getestet wird das Zusammensetzen des API-Bodys — Zeitplan vs. Ereignis,
 * Cron-Voreinstellung, Argumentwerte nur wenn gefüllt.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduleDialog from './ScheduleDialog';
import type { Flow } from '@/types/flows';

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const FLOWS: Flow[] = [
  {
    name: 'recherche',
    beschreibung: 'sucht',
    argumente: [{ name: 'thema', typ: 'freitext', beschreibung: 'Worum?', pflicht: true }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: [] });
  apiMock.post.mockResolvedValue({ data: { id: 1 } });
});

test('legt einen Zeitplan an (Cron-Preset + Argumentwert)', async () => {
  const user = userEvent.setup();
  wrap(<ScheduleDialog isOpen onClose={vi.fn()} flows={FLOWS} />);

  await user.click(screen.getByRole('button', { name: 'Täglich 8 Uhr' }));
  await user.type(screen.getByLabelText('Wert für thema'), 'Klimawandel');
  await user.click(screen.getByRole('button', { name: 'Anlegen' }));

  await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
  expect(apiMock.post).toHaveBeenCalledWith('/flows/zeitplaene', {
    flow: 'recherche',
    trigger_type: 'zeitplan',
    cron: '0 8 * * *',
    args: { thema: 'Klimawandel' },
  });
});

test('wechselt auf Ereignis und schickt event_name', async () => {
  const user = userEvent.setup();
  wrap(<ScheduleDialog isOpen onClose={vi.fn()} flows={FLOWS} />);

  await user.click(screen.getByRole('button', { name: /Ereignis/i }));
  await user.type(screen.getByLabelText('Ereignis-Name'), 'neue-rechnung');
  await user.click(screen.getByRole('button', { name: 'Anlegen' }));

  await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
  expect(apiMock.post).toHaveBeenCalledWith('/flows/zeitplaene', {
    flow: 'recherche',
    trigger_type: 'ereignis',
    event_name: 'neue-rechnung',
    args: {},
  });
});
