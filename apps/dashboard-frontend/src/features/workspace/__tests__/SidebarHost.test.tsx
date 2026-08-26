/**
 * SidebarHost — Ansichts-Mapping (Plan 012 Phase B, Schritt 6).
 * Die aktive Activity-Bar-Ansicht (`activeView`) bestimmt den Inhalt der
 * linken Sidebar. Seit B2 gibt es keinen Datei-Explorer mehr, seit B3 keine
 * Erweiterungs- und keine Flow-Ansicht: ohne gewählte Ansicht bleibt die
 * Spalte leer.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ActivityView } from '@/stores/workspaceStore';
import { SidebarHost } from '../SidebarHost';

// Ansichten mit Datenanbindung (useStoreCatalog) hier isolieren — dieser
// Test prüft nur das Ansichts-Mapping, nicht deren Innenleben.
vi.mock('../sidebar/ModelsPanel', () => ({
  ModelsPanel: () => <div data-testid="models-panel" />,
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
