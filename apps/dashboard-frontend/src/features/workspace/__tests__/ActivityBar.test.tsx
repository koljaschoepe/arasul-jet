/**
 * ActivityBar — die schmale Spalte ganz links.
 *
 * Seit D1 steht »Apps« oben und ist für jeden da; »Modelle« und das
 * Einstellungen-Zahnrad gehören dem Administrator. Die Rolle blendet aus, das
 * Backend entscheidet — hier wird nur das Ausblenden geprüft.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../ActivityBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
  });
}

describe('ActivityBar, feste Spalte: Apps + Modelle + Zahnrad', () => {
  beforeEach(() => {
    resetStore();
    angemeldet({ role: 'admin' });
  });

  it('zeigt dem Administrator Apps, Modelle und das Einstellungen-Zahnrad', () => {
    render(<ActivityBar />);
    for (const label of ['Apps', 'Modelle', 'Einstellungen']) {
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

  it('zeigt dem Mitarbeiter NUR die Apps', () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    render(<ActivityBar />);
    expect(screen.getByLabelText('Apps')).toBeInTheDocument();
    expect(screen.queryByLabelText('Modelle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Einstellungen')).not.toBeInTheDocument();
  });

  it('Apps wählt die Ansicht, zieht die Sidebar auf und öffnet die Übersicht', () => {
    useWorkspaceStore.setState({ sidebarVisible: false, activeView: 'models' });
    render(<ActivityBar />);
    fireEvent.click(screen.getByLabelText('Apps'));
    const s = useWorkspaceStore.getState();
    expect(s.activeView).toBe('apps');
    expect(s.sidebarVisible).toBe(true);
    expect(s.activeTabId).toBe('dashboard');
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
