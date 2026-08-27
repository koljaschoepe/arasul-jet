/**
 * SidebarHost — Ansichts-Mapping (Plan 012 Phase B, Schritt 6).
 *
 * Die aktive Activity-Bar-Ansicht (`activeView`) bestimmt den Inhalt der
 * linken Sidebar. Seit D1 gibt es keinen Leerzustand mehr: die Voreinstellung
 * sind die Apps, und ein Mitarbeiter, dessen gespeicherter Stand auf einer
 * Admin-Ansicht steht, sieht ebenfalls die Apps.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ActivityView } from '@/stores/workspaceStore';
import { SidebarHost } from '../SidebarHost';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

// Ansichten mit Datenanbindung hier isolieren — dieser Test prüft nur das
// Ansichts-Mapping, nicht deren Innenleben.
vi.mock('../sidebar/AppsPanel', () => ({
  AppsPanel: () => <div data-testid="apps-panel" />,
}));
vi.mock('../sidebar/ModelsPanel', () => ({
  ModelsPanel: () => <div data-testid="models-panel" />,
}));
vi.mock('../sidebar/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel" />,
}));

function reset(activeView: ActivityView) {
  useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeView, sidebarVisible: true });
}

describe('SidebarHost, Ansichts-Mapping', () => {
  beforeEach(() => {
    reset('apps');
    angemeldet({ role: 'admin' });
  });

  it('apps → die eigenen Apps, und das ist die Voreinstellung', () => {
    render(<SidebarHost />);
    expect(screen.getByTestId('apps-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('models-panel')).not.toBeInTheDocument();
  });

  it('models → Modell-Ansicht', () => {
    reset('models');
    render(<SidebarHost />);
    expect(screen.getByTestId('models-panel')).toBeInTheDocument();
  });

  it('settings → Bereiche der Einstellungen', () => {
    reset('settings');
    render(<SidebarHost />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('einem Mitarbeiter zeigt eine gespeicherte Admin-Ansicht trotzdem die Apps', () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    reset('settings');
    render(<SidebarHost />);
    expect(screen.getByTestId('apps-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
  });

  it('reagiert auf einen Ansichtswechsel im Store', () => {
    render(<SidebarHost />);
    expect(screen.queryByTestId('models-panel')).not.toBeInTheDocument();
    act(() => useWorkspaceStore.setState({ activeView: 'models' }));
    expect(screen.getByTestId('models-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('apps-panel')).not.toBeInTheDocument();
  });
});
