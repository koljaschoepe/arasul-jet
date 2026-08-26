import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
    // »Automation« (n8n) ist mit B5 gefallen.
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
});
