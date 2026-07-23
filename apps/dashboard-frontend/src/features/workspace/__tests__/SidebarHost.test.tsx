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

// Skills-Ansicht zieht echte Daten (useSkills) — hier isolieren.
vi.mock('../sidebar/SkillsPanel', () => ({
  SkillsPanel: () => <div data-testid="skills-panel" />,
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
    expect(screen.getByText('Modelle')).toBeInTheDocument();
  });

  it('extensions → Erweiterungs-Ansicht', () => {
    reset('extensions');
    render(<SidebarHost />);
    expect(screen.getByText('Erweiterungen')).toBeInTheDocument();
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
