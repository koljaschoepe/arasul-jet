/**
 * SidebarHost — Ansichts-Mapping (Plan 012 Phase B, Schritt 6).
 * Die aktive Activity-Bar-Ansicht (`activeView`) bestimmt den Inhalt der
 * linken Sidebar. Der Datei-Explorer bleibt beim Wechsel gemountet (nur
 * versteckt), damit sein Baum-Zustand erhalten bleibt.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { SidebarHost } from '../SidebarHost';

vi.mock('../explorer/ExplorerPanel', () => ({
  ExplorerPanel: () => <div data-testid="explorer" />,
}));

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

function reset(activeView: 'files' | 'search' | 'models' | 'extensions' | 'flows') {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView,
    sidebarVisible: true,
    sidebarRestore: null,
  });
}

describe('SidebarHost, Ansichts-Mapping', () => {
  beforeEach(() => reset('files'));

  it('files → Datei-Explorer', () => {
    render(<SidebarHost />);
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
  });

  it('search (entfernt) → fällt auf den Datei-Explorer zurück', () => {
    // Die »Suche«-Ansicht ist entfernt; ein alter persistierter Wert darf keine
    // leere Sidebar erzeugen — der Explorer ist der Fallback.
    reset('search');
    render(<SidebarHost />);
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
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

  it('reagiert auf einen Ansichtswechsel im Store', () => {
    render(<SidebarHost />);
    expect(screen.queryByTestId('models-panel')).not.toBeInTheDocument();
    act(() => useWorkspaceStore.setState({ activeView: 'models' }));
    expect(screen.getByTestId('models-panel')).toBeInTheDocument();
  });
});
