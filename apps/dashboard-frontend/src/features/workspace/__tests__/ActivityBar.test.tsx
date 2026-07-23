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

describe('ActivityBar — feste Spalte: Dateien · Suche · Modelle · Erweiterungen · Skills + Zahnrad', () => {
  beforeEach(() => {
    resetStore();
    enabledApps.clear();
  });

  it('zeigt die fünf Ansichten und das Einstellungen-Zahnrad (jetzt in der Bar)', () => {
    render(<ActivityBar />);
    for (const label of [
      'Dateien',
      'Suche',
      'Modelle',
      'Erweiterungen',
      'Skills',
      'Einstellungen',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Automation ist kein fester Bereich — nur als aktivierte Erweiterung
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();
  });

  it('Suche wählt die Ansicht und zieht die Sidebar auf', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Suche'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('search');
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
