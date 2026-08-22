/**
 * GitSyncControl-Tests (Plan 013, B9): die GitHub-Sync-Steuerung in der
 * Statusleiste. Nicht verbunden → Verbinden-Formular schickt Repo/Branch/PAT;
 * verbunden → „Synchronisieren" ruft den Sync-Endpunkt für das aktive Projekt.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GitSyncControl } from './GitSyncControl';
import type { GitLink } from '@/types/git';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get, post, del }) }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

vi.mock('@/features/workspace/useProjects', () => ({
  useActiveProject: () => ({ activeId: 'p1', activeProject: { id: 'p1', name: 'Standard' } }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const LINK: GitLink = {
  project_id: 'p1',
  repo_url: 'https://github.com/acme/widgets.git',
  branch: 'main',
  pat_last4: 'cd12',
  local_path: '/arasul/projects/p1',
  last_synced_at: '2026-07-27T10:00:00.000Z',
  last_status: 'synchronisiert',
  last_error: null,
  last_commit: 'abc1234',
  created_at: '2026-07-27T09:00:00.000Z',
  updated_at: '2026-07-27T10:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

test('nicht verbunden: „Kein Repo", Verbinden-Formular schickt Repo/Branch/PAT', async () => {
  get.mockResolvedValue({ data: null });
  post.mockResolvedValue({ data: LINK });
  wrap(<GitSyncControl />);

  const trigger = await screen.findByTestId('workspace-statusbar-git');
  expect(trigger).toHaveTextContent('Kein Repo');

  fireEvent.click(trigger);
  fireEvent.change(await screen.findByTestId('git-repo-input'), {
    target: { value: 'https://github.com/acme/widgets' },
  });
  fireEvent.change(screen.getByTestId('git-pat-input'), { target: { value: 'ghp_secretcd12' } });
  fireEvent.click(screen.getByTestId('git-connect-button'));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/git/p1/connect', {
      repo_url: 'https://github.com/acme/widgets',
      branch: 'main',
      pat: 'ghp_secretcd12',
    })
  );
});

test('verbunden: zeigt owner/repo und synchronisiert das aktive Projekt', async () => {
  get.mockResolvedValue({ data: LINK });
  post.mockResolvedValue({ data: { status: 'synchronisiert', commit: 'def5678', pushed: true } });
  wrap(<GitSyncControl />);

  const trigger = await screen.findByTestId('workspace-statusbar-git');
  await waitFor(() => expect(trigger).toHaveTextContent('acme/widgets'));

  fireEvent.click(trigger);
  fireEvent.click(await screen.findByTestId('git-sync-button'));

  await waitFor(() => expect(post).toHaveBeenCalledWith('/git/p1/sync', {}));
});

/**
 * Plan 023 G3: die beiden Punkte aus dem Umfang, die noch fehlten —
 * „Änderungen gegenüber dem Stand auf GitHub" und „Zweig wechseln".
 */
const AENDERUNGEN = {
  gekoppelt: true as const,
  zweig: 'main',
  dateien: [
    { art: 'geändert' as const, pfad: 'src/a.js' },
    { art: 'neu' as const, pfad: 'notiz.md' },
  ],
  mehr: 0,
  voraus: 2,
  zurueck: 1,
  stand: '2026-08-22T10:00:00.000Z',
  nieSynchronisiert: false,
};

/** GET-Doppel, das je nach Pfad Kopplung oder Änderungen liefert. */
function getFuer(aenderungen: unknown = AENDERUNGEN) {
  return vi.fn(async (pfad: string) =>
    pfad.endsWith('/aenderungen') ? { data: aenderungen } : { data: LINK }
  );
}

test('zeigt die geänderten Dateien und wie weit es auseinandergeht (G3)', async () => {
  get.mockImplementation(getFuer());
  wrap(<GitSyncControl />);
  fireEvent.click(await screen.findByTestId('workspace-statusbar-git'));

  const kasten = await screen.findByTestId('git-aenderungen');
  await waitFor(() => expect(kasten).toHaveTextContent('src/a.js'));
  expect(kasten).toHaveTextContent('notiz.md');
  expect(kasten).toHaveTextContent('2 eigene Änderung(en) noch nicht übertragen');
  expect(kasten).toHaveTextContent('1 von GitHub noch nicht geholt');
  // Die Anzeige sagt dazu, WORAUF sie sich bezieht — sie hat nicht nachgesehen.
  expect(kasten).toHaveTextContent('Verglichen mit dem Stand vom');
});

test('sagt es, wenn nichts anders ist (G3)', async () => {
  get.mockImplementation(getFuer({ ...AENDERUNGEN, dateien: [], voraus: 0, zurueck: 0 }));
  wrap(<GitSyncControl />);
  fireEvent.click(await screen.findByTestId('workspace-statusbar-git'));
  await waitFor(() =>
    expect(screen.getByTestId('git-aenderungen')).toHaveTextContent('Keine Unterschiede.')
  );
});

test('haelt eine Antwort ohne Dateiliste aus (G3)', async () => {
  // Die Statusleiste haengt in JEDER Ansicht; sie darf an einer unerwarteten
  // Antwort nicht zerbrechen.
  get.mockImplementation(getFuer({ gekoppelt: true, zweig: 'main' }));
  wrap(<GitSyncControl />);
  fireEvent.click(await screen.findByTestId('workspace-statusbar-git'));
  expect(await screen.findByTestId('git-aenderungen')).toBeInTheDocument();
});

test('wechselt den Zweig ueber dieselbe Kopplung, ohne Token-Eingabe (G3)', async () => {
  get.mockImplementation(getFuer());
  post.mockResolvedValue({ data: { status: 'synchronisiert', commit: 'ff00', pushed: true } });
  wrap(<GitSyncControl />);
  fireEvent.click(await screen.findByTestId('workspace-statusbar-git'));

  fireEvent.click(await screen.findByTestId('git-zweig-wechseln'));
  const feld = screen.getByTestId('git-zweig-eingabe');
  fireEvent.change(feld, { target: { value: 'entwicklung' } });
  fireEvent.click(screen.getByTestId('git-zweig-uebernehmen'));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/git/p1/connect', {
      repo_url: LINK.repo_url,
      branch: 'entwicklung',
    })
  );
  // KEIN pat im Rumpf: der gespeicherte Token bleibt unangetastet.
  expect(post.mock.calls[0]?.[1]).not.toHaveProperty('pat');
  // Und danach wird einmal synchronisiert, sonst zeigte der Baum den alten Zweig.
  await waitFor(() => expect(post).toHaveBeenCalledWith('/git/p1/sync', {}));
});

test('derselbe Zweig loest keinen Wechsel aus (G3)', async () => {
  get.mockImplementation(getFuer());
  wrap(<GitSyncControl />);
  fireEvent.click(await screen.findByTestId('workspace-statusbar-git'));
  fireEvent.click(await screen.findByTestId('git-zweig-wechseln'));
  fireEvent.click(screen.getByTestId('git-zweig-uebernehmen'));
  await waitFor(() => expect(screen.queryByTestId('git-zweig-eingabe')).not.toBeInTheDocument());
  expect(post).not.toHaveBeenCalled();
});
