import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
    activeView: null,
    sidebarVisible: true,
    rightPanelVisible: true,
  });
}

describe('ActivityBar, feste Spalte: Modelle + Zahnrad', () => {
  beforeEach(() => {
    resetStore();
    enabledApps.clear();
  });

  it('zeigt die Ansicht Modelle und das Einstellungen-Zahnrad', () => {
    render(<ActivityBar />);
    for (const label of ['Modelle', 'Einstellungen']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // »Dateien« (Explorer) ist mit B2 gefallen, »Erweiterungen« und »Flows«
    // mit B3, »Suche« schon davor.
    for (const label of ['Dateien', 'Suche', 'Erweiterungen', 'Flows']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    // Automation ist kein fester Bereich — nur als aktivierte Erweiterung
    expect(screen.queryByLabelText('Automation')).not.toBeInTheDocument();
  });

  it('Modelle wählt die Ansicht, zieht die Sidebar auf und öffnet den Modelle-Tab', () => {
    useWorkspaceStore.setState({ sidebarVisible: false });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Modelle'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('models');
    expect(s.sidebarVisible).toBe(true);
    expect(s.activeTabId).toBe('modelle');
  });

  it('die aktive Ansicht (offen) klappt die Sidebar wieder ein', () => {
    useWorkspaceStore.setState({ activeView: 'models', sidebarVisible: true });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Modelle'));
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);
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
