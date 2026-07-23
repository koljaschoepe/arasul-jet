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

// Ansichten mit Datenanbindung (useSkills / useStoreCatalog) hier isolieren —
// dieser Test prüft nur das Ansichts-Mapping, nicht deren Innenleben.
vi.mock('../sidebar/SkillsPanel', () => ({
  SkillsPanel: () => <div data-testid="skills-panel" />,
}));
vi.mock('../sidebar/ModelsPanel', () => ({
  ModelsPanel: () => <div data-testid="models-panel" />,
}));
vi.mock('../sidebar/ExtensionsPanel', () => ({
  ExtensionsPanel: () => <div data-testid="extensions-panel" />,
}));

function reset(activeView: 'files' | 'search' | 'models' | 'extensions' | 'skills') {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView,
    sidebarVisible: true,
    sidebarRestore: null,
  });
}

describe('SidebarHost — Ansichts-Mapping', () => {
  beforeEach(() => reset('files'));

  it('files → Datei-Explorer', () => {
    render(<SidebarHost />);
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
  });

  it('search → Such-Ansicht (Explorer bleibt gemountet, aber versteckt)', () => {
    reset('search');
    render(<SidebarHost />);
    expect(screen.getByText('Suche')).toBeInTheDocument();
    // Explorer bleibt für den Baum-Zustand im DOM (nur per `hidden` verborgen).
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
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

  it('skills → Skill-Ansicht', () => {
    reset('skills');
    render(<SidebarHost />);
    expect(screen.getByTestId('skills-panel')).toBeInTheDocument();
  });

  it('reagiert auf einen Ansichtswechsel im Store', () => {
    render(<SidebarHost />);
    expect(screen.queryByText('Suche')).not.toBeInTheDocument();
    act(() => useWorkspaceStore.setState({ activeView: 'search' }));
    expect(screen.getByText('Suche')).toBeInTheDocument();
  });
});
