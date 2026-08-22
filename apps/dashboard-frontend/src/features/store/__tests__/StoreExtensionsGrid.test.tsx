/**
 * StoreExtensionsGrid — Erweiterungen-Reiter (Plan 012 Phase C Schritt 9).
 * Prüft: Filter aus dem storeFilterStore grenzen das Raster ein, und der
 * „Eigene Erweiterung bauen"-Einstieg öffnet die Baukasten-Detailseite.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { EMPTY_EXTENSION_FILTERS } from '../storeExtensionFilters';
import { StoreExtensionsGrid } from '../StoreExtensionsGrid';

const STANDARD_APPS = [
  { id: 'n8n', name: 'n8n', description: 'Workflows', tab: 'automationen', enabled: true },
  { id: 'db', name: 'Datenbank', description: 'SQL', tab: 'database', enabled: false },
];
let apps = STANDARD_APPS;
const setAppEnabled = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({ apps, setAppEnabled, isLoading: false }),
}));

// Installierte Erweiterungs-Pakete (Plan 012 Phase E): hier bewusst leer —
// dieser Test prüft die kuratierten Kern-Apps und den Baukasten-Einstieg.
const setExtensionEnabled = vi.fn().mockResolvedValue(undefined);
let extensions: unknown[] = [];
vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => ({ extensions, isLoading: false, setExtensionEnabled }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

describe('StoreExtensionsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtensionStore.getState().clearSelection();
    useStoreFilterStore.setState({ extFilters: EMPTY_EXTENSION_FILTERS, extQuery: '' });
    apps = STANDARD_APPS;
    extensions = [];
  });

  it('zeigt ohne Suche alle Erweiterungen + den Baukasten-Einstieg', () => {
    render(<StoreExtensionsGrid />);
    expect(screen.getByTestId('ext-card-n8n')).toBeInTheDocument();
    expect(screen.getByTestId('ext-card-db')).toBeInTheDocument();
    expect(screen.getByTestId('ext-builder-entry')).toBeInTheDocument();
  });

  it('eine Suche grenzt das Raster über Name/Beschreibung ein und blendet den Einstieg aus', () => {
    useStoreFilterStore.setState({ extQuery: 'Datenbank' });
    render(<StoreExtensionsGrid />);
    expect(screen.getByTestId('ext-card-db')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-card-n8n')).not.toBeInTheDocument();
    // Bei aktiver Suche geht es um Erweiterungen, nicht ums Bauen.
    expect(screen.queryByTestId('ext-builder-entry')).not.toBeInTheDocument();
  });

  // Plan 023 B4: ab Werk ist keine Erweiterung enthalten. Ohne einen Satz dazu
  // stünde auf einem neuen Gerät eine einzelne gestrichelte Kachel in einer
  // leeren Fläche und sähe aus, als hätte etwas nicht geladen.
  it('erklärt den leeren Katalog, statt nur eine Kachel stehen zu lassen', () => {
    apps = [];
    render(<StoreExtensionsGrid />);
    expect(screen.getByText('Noch keine Erweiterung')).toBeInTheDocument();
    expect(screen.getByTestId('ext-builder-entry')).toBeInTheDocument();
  });

  it('sagt das nicht, solange etwas da ist', () => {
    render(<StoreExtensionsGrid />);
    expect(screen.queryByText('Noch keine Erweiterung')).not.toBeInTheDocument();
  });

  it('der Einstieg öffnet die Baukasten-Detailseite (kind: builder)', () => {
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByTestId('ext-builder-entry'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'builder', id: 'builder' });
  });
});

/**
 * Plan 023 H5: Ausschalten fragt einmal nach, wenn Tabs offen sind.
 *
 * Vorher schloss der Schalter offene Tabs der Kern-App wortlos, und bei einem
 * Paket blieb der Tab sogar offen stehen und zeigte etwas, das laut Schalter
 * gar nicht mehr da ist.
 */
describe('Schalter mit Rueckfrage (Plan 023 H5)', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
  });

  it('schaltet ohne offene Tabs sofort, ohne zu fragen', async () => {
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('n8n deaktivieren'));
    await waitFor(() => expect(setAppEnabled).toHaveBeenCalledWith('n8n', false));
    expect(screen.queryByText('Erweiterung ausblenden?')).not.toBeInTheDocument();
  });

  it('fragt einmal nach, wenn ein Tab der App offen ist', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 't1', type: 'automationen', title: 'n8n' }],
      activeTabId: 't1',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('n8n deaktivieren'));

    expect(await screen.findByText('Erweiterung ausblenden?')).toBeInTheDocument();
    // Und zwar VOR dem Schalten, nicht danach.
    expect(setAppEnabled).not.toHaveBeenCalled();
    expect(screen.getByText(/ein offener Tab/)).toBeInTheDocument();
  });

  it('Abbrechen laesst alles wie es war', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 't1', type: 'automationen', title: 'n8n' }],
      activeTabId: 't1',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('n8n deaktivieren'));
    fireEvent.click(await screen.findByText('Abbrechen'));

    await waitFor(() =>
      expect(screen.queryByText('Erweiterung ausblenden?')).not.toBeInTheDocument()
    );
    expect(setAppEnabled).not.toHaveBeenCalled();
  });

  it('Bestaetigen schaltet dann wirklich aus', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 't1', type: 'automationen', title: 'n8n' }],
      activeTabId: 't1',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('n8n deaktivieren'));
    fireEvent.click(await screen.findByText('Ausblenden'));

    await waitFor(() => expect(setAppEnabled).toHaveBeenCalledWith('n8n', false));
  });

  it('beim EINschalten wird nie gefragt', async () => {
    // Da geht nichts zu; eine Rueckfrage waere ein Klick ohne Grund.
    useWorkspaceStore.setState({
      tabs: [{ id: 't1', type: 'erweiterungen', title: 'Erweiterungen' }],
      activeTabId: 't1',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('Datenbank aktivieren'));
    await waitFor(() => expect(setAppEnabled).toHaveBeenCalledWith('db', true));
    expect(screen.queryByText('Erweiterung ausblenden?')).not.toBeInTheDocument();
  });

  it('beide Karten tragen dieselbe Schalterbeschriftung', () => {
    extensions = [
      {
        id: 'e1',
        name: 'Mein Paket',
        description: 'Test',
        version: '1.0.0',
        type: 'app',
        accessTier: 'basis',
        source: 'built',
        enabled: true,
      },
    ];
    render(<StoreExtensionsGrid />);
    // Zweimal dieselbe Beschriftung: einmal an der Kern-App, einmal am Paket.
    expect(screen.getAllByText('Im Workspace sichtbar').length).toBeGreaterThanOrEqual(2);
    // Und die Herkunft steht jetzt bei den Merkmalen, nicht am Schalter.
    expect(screen.getByText('Selbst gebaut')).toBeInTheDocument();
  });
});

describe('Ein Paket schliesst beim Ausblenden seine Tabs (Plan 023 H5)', () => {
  const PAKET = {
    id: 'e1',
    name: 'Mein Paket',
    description: 'Test',
    version: '1.0.0',
    type: 'app',
    accessTier: 'basis',
    source: 'built',
    enabled: true,
  };

  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
    extensions = [PAKET];
  });

  it('fragt nach und schliesst danach den Tab', async () => {
    // Vorher blieb der Tab offen stehen und zeigte etwas, das laut Schalter
    // gar nicht mehr da ist. Kern-Apps schliessen ihre Tabs seit jeher.
    useWorkspaceStore.setState({
      tabs: [{ id: 't1', type: 'extension', extensionId: 'e1', title: 'Mein Paket' }],
      activeTabId: 't1',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('Mein Paket deaktivieren'));

    expect(await screen.findByText('Erweiterung ausblenden?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ausblenden'));

    await waitFor(() => expect(setExtensionEnabled).toHaveBeenCalledWith('e1', false));
    await waitFor(() => expect(useWorkspaceStore.getState().tabs).toHaveLength(0));
  });

  it('laesst den Tab eines ANDEREN Pakets in Ruhe', async () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 't2', type: 'extension', extensionId: 'e2', title: 'Fremd' }],
      activeTabId: 't2',
    });
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByLabelText('Mein Paket deaktivieren'));

    // Kein fremder Tab betroffen, also auch keine Rueckfrage.
    await waitFor(() => expect(setExtensionEnabled).toHaveBeenCalledWith('e1', false));
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
  });
});
