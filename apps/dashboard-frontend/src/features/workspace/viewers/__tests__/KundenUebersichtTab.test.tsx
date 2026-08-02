/**
 * KundenUebersichtTab Tests (Plan 014, Phase 3).
 *
 * Kernzusagen: (1) Die Tabelle zeigt die Steckbrief-Felder der Kunden des
 * aktiven Projekts. (2) Klick auf eine Zeile öffnet den Steckbrief als
 * Datei-Tab. (3) Ohne Kunden erscheint der /neuer-kunde-Hinweis.
 */
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KundenUebersichtTab from '../KundenUebersichtTab';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const apiGet = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get: apiGet }) }));
vi.mock('../../useProjects', () => ({
  useActiveProject: () => ({
    activeProject: { id: 'p1', name: 'Vertrieb' },
    activeId: 'p1',
  }),
}));

function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const KUNDE = {
  ordner: 'Alpha GmbH',
  pfad: 'Kunden/Alpha GmbH',
  steckbrief_pfad: 'Kunden/Alpha GmbH/Steckbrief.md',
  firma: 'Alpha GmbH',
  webseite: 'https://alpha.de',
  branche: null,
  ansprechpartner: 'Anna Alpha',
  email: 'anna@alpha.de',
  telefon: null,
  status: 'Kunde',
  letzter_kontakt: '2026-07-30',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KundenUebersichtTab', () => {
  it('zeigt die Kunden des aktiven Projekts mit Steckbrief-Feldern', async () => {
    apiGet.mockResolvedValue({ data: [KUNDE] });
    render(<KundenUebersichtTab />);

    expect(await screen.findByText('Alpha GmbH')).toBeInTheDocument();
    expect(screen.getByText('Kunde')).toBeInTheDocument();
    expect(screen.getByText('2026-07-30')).toBeInTheDocument();
    expect(screen.getByText('Anna Alpha')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith('/projects/p1/kunden', { showError: false });
  });

  it('Klick auf eine Zeile öffnet den Steckbrief als Datei-Tab', async () => {
    const openTab = vi.fn();
    const vorher = useWorkspaceStore.getState().openTab;
    useWorkspaceStore.setState({ openTab });
    apiGet.mockResolvedValue({ data: [KUNDE] });
    const user = userEvent.setup();
    render(<KundenUebersichtTab />);

    await user.click(await screen.findByTestId('kunden-zeile'));
    expect(openTab).toHaveBeenCalledWith({
      type: 'projektdatei',
      projectId: 'p1',
      filePath: 'Kunden/Alpha GmbH/Steckbrief.md',
      title: 'Alpha GmbH',
    });
    useWorkspaceStore.setState({ openTab: vorher });
  });

  it('ohne Kunden: Hinweis auf /neuer-kunde', async () => {
    apiGet.mockResolvedValue({ data: [] });
    render(<KundenUebersichtTab />);
    expect(await screen.findByText('Noch keine Kunden')).toBeInTheDocument();
    expect(screen.getByText(/neuer-kunde/)).toBeInTheDocument();
  });
});
