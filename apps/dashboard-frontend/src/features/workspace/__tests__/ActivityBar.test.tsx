import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useExtensionStore } from '@/stores/extensionStore';

// App-Gating deterministisch mocken (echte Datenbasis: GET /workspace-apps)
const enabledApps = new Set<string>();
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [],
    isLoading: false,
    isAppEnabled: (id: string) => enabledApps.has(id),
    setAppEnabled: vi.fn(),
  }),
}));

// Installierte Erweiterungs-Pakete mocken (echte Datenbasis: GET /extensions)
interface MockExtension {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}
const installedExtensions: MockExtension[] = [];
vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => ({ extensions: installedExtensions, isLoading: false }),
}));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'files',
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
  useExtensionStore.setState({ storeTab: 'models', selected: null });
}

describe('ActivityBar — feste Spalte: Dateien · Modelle · Erweiterungen · Flows + Zahnrad', () => {
  beforeEach(() => {
    resetStore();
    enabledApps.clear();
    installedExtensions.length = 0;
  });

  it('zeigt die vier Ansichten und das Einstellungen-Zahnrad (jetzt in der Bar)', () => {
    render(<ActivityBar />);
    for (const label of ['Dateien', 'Modelle', 'Erweiterungen', 'Flows', 'Einstellungen']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Die frühere »Suche«-Ansicht ist entfernt.
    expect(screen.queryByLabelText('Suche')).not.toBeInTheDocument();
    // Automation ist kein fester Bereich — nur als aktivierte Erweiterung
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();
  });

  it('Flows wählt die Ansicht und zieht die Sidebar auf', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Flows'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('flows');
    expect(s.sidebarVisible).toBe(true);
  });

  it('Dateien (aktiv + offen) klappt die Sidebar wieder ein', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Dateien'));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
  });

  it('Modelle öffnet den Store-Tab und aktiviert den Modelle-Reiter', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Modelle'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('models');
    expect(s.activeTabId).toBe('store');
    expect(useExtensionStore.getState().storeTab).toBe('models');
  });

  it('Erweiterungen öffnet den Store-Tab und aktiviert den Erweiterungen-Reiter', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Erweiterungen'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('extensions');
    expect(s.activeTabId).toBe('store');
    expect(useExtensionStore.getState().storeTab).toBe('extensions');
  });

  it('Einstellungen öffnet den Einstellungen-Tab', () => {
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });

  it('aktivierte App-Erweiterungen bekommen einen eigenen Eintrag, der ihren Tab öffnet', () => {
    installedExtensions.push(
      { id: 'meine-app', name: 'Meine App', type: 'app', enabled: true },
      { id: 'aus-geschaltet', name: 'Aus', type: 'app', enabled: false },
      { id: 'werkzeug', name: 'Werkzeug', type: 'tool', enabled: true }
    );
    render(<ActivityBar />);

    // Nur aktivierte App-Erweiterungen — deaktivierte und flow/tool-Pakete nicht.
    expect(screen.queryByLabelText('Aus')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Werkzeug')).not.toBeInTheDocument();

    const btn = screen.getByLabelText('Meine App');
    fireEvent.click(btn);
    const s = useWorkspaceStore.getState();
    expect(s.activeTabId).toBe('extension:meine-app');
    expect(s.tabs.some(t => t.type === 'extension' && t.extensionId === 'meine-app')).toBe(true);
  });

  it('n8n (Automation) erscheint NUR wenn die Erweiterung aktiviert ist und öffnet den Automationen-Tab', () => {
    const { rerender } = render(<ActivityBar />);
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();

    enabledApps.add('n8n');
    rerender(<ActivityBar />);
    const btn = screen.getByLabelText('Automation');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(useWorkspaceStore.getState().activeTabId).toBe('automationen');
  });
});
