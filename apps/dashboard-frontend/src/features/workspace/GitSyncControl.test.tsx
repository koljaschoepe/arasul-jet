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
