/**
 * SkillsPanel Tests (Plan 012 Phase D, Schritt 12).
 * Die Sidebar-Übersicht listet Skills; ein Klick öffnet den Skill-Editor-Tab
 * mit dem Ziel, der Kopf-Knopf »Neuer Skill« öffnet ihn leer.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSkillEditorStore } from '@/stores/skillEditorStore';
import { SkillsPanel } from '../SkillsPanel';

const skillsState = { skills: [] as { name: string; beschreibung?: string }[], isLoading: false };
vi.mock('@/hooks/useSkills', () => ({ useSkills: () => skillsState }));

describe('SkillsPanel', () => {
  beforeEach(() => {
    skillsState.skills = [
      { name: 'recherche', beschreibung: 'sucht im Netz' },
      { name: 'notiz', beschreibung: '' },
    ];
    skillsState.isLoading = false;
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
    useSkillEditorStore.setState({ editName: 'irgendwas' });
  });

  it('listet die Skills als Slash-Namen', () => {
    render(<SkillsPanel />);
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.getByText('/notiz')).toBeInTheDocument();
  });

  it('ein Klick öffnet den Skill-Editor-Tab mit dem Ziel', () => {
    render(<SkillsPanel />);
    fireEvent.click(screen.getByTestId('skill-open-recherche'));
    expect(useSkillEditorStore.getState().editName).toBe('recherche');
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('skill');
    expect(useWorkspaceStore.getState().activeTabId).toBe('skill');
  });

  it('»Neuer Skill« öffnet den Editor-Tab leer', () => {
    render(<SkillsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Skill' }));
    expect(useSkillEditorStore.getState().editName).toBeNull();
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('skill');
  });

  it('zeigt eine Anlege-Aufforderung, wenn keine Skills da sind', () => {
    skillsState.skills = [];
    render(<SkillsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Skill anlegen' }));
    expect(useSkillEditorStore.getState().editName).toBeNull();
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('skill');
  });
});
