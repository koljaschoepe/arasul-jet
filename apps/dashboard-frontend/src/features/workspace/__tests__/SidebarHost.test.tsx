/**
 * SidebarHost — Ansichts-Mapping (Plan 012 Phase B, Schritt 6).
 * Die aktive Activity-Bar-Ansicht (`activeView`) bestimmt den Inhalt der
 * linken Sidebar. Seit B2 gibt es keinen Datei-Explorer mehr: ohne gewählte
 * Ansicht bleibt die Spalte leer.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ActivityView } from '@/stores/workspaceStore';
import { SidebarHost } from '../SidebarHost';

// Ansichten mit Datenanbindung (useFlows / useStoreCatalog) hier isolieren —
// dieser Test prüft nur das Ansichts-Mapping, nicht deren Innenleben.
vi.mock('../sidebar/FlowsPanel', () => ({
  FlowsPanel: () => <div data-testid="flows-panel" />,
}));
vi.mock('../sidebar/ModelsPanel', () => ({
  ModelsPanel: () => <div data-testid="models-panel" />,
}));
vi.mock('../sidebar/ExtensionsPanel', () => ({
  ExtensionsPanel: () => <div data-testid="extensions-panel" />,
}));
vi.mock('../sidebar/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel" />,
}));

function reset(activeView: ActivityView | null) {
  useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeView, sidebarVisible: true });
}

describe('SidebarHost, Ansichts-Mapping', () => {
  beforeEach(() => reset(null));

  it('ohne Ansicht ist die Spalte leer (kein Explorer mehr)', () => {
    render(<SidebarHost />);
    expect(screen.getByTestId('workspace-sidebar-leer')).toBeInTheDocument();
    expect(screen.queryByTestId('models-panel')).not.toBeInTheDocument();
  });

  it('models → Modell-Ansicht', () => {
    reset('models');
    render(<SidebarHost />);
    expect(screen.getByTestId('models-panel')).toBeInTheDocument();
  });

  it('extensions → Erweiterungs-Ansicht', () => {
    reset('extensions');
    render(<SidebarHost />);
    expect(screen.getByTestId('extensions-panel')).toBeInTheDocument();
  });

  it('flows → Flow-Ansicht', () => {
    reset('flows');
    render(<SidebarHost />);
    expect(screen.getByTestId('flows-panel')).toBeInTheDocument();
  });

  it('settings → Bereiche der Einstellungen', () => {
    reset('settings');
    render(<SidebarHost />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('reagiert auf einen Ansichtswechsel im Store', () => {
    render(<SidebarHost />);
    expect(screen.queryByTestId('models-panel')).not.toBeInTheDocument();
    act(() => useWorkspaceStore.setState({ activeView: 'models' }));
    expect(screen.getByTestId('models-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-sidebar-leer')).not.toBeInTheDocument();
  });
});
