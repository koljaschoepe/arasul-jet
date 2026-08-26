/**
 * FlowsPanel Tests (Plan 012 Phase D, Schritt 12).
 * Die Sidebar-Übersicht listet Flows; ein Klick öffnet den Flow-Editor-Tab
 * mit dem Ziel, der Kopf-Knopf »Neuer Flow« öffnet ihn leer.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import { FlowsPanel } from '../FlowsPanel';

interface TestFlow {
  name: string;
  beschreibung?: string;
  projekt?: { id: string; name: string };
}
const flowsState = { flows: [] as TestFlow[], isLoading: false };
vi.mock('@/hooks/useFlows', () => ({ useFlows: () => flowsState }));

describe('FlowsPanel', () => {
  beforeEach(() => {
    flowsState.flows = [
      { name: 'recherche', beschreibung: 'sucht im Netz' },
      { name: 'notiz', beschreibung: '' },
    ];
    flowsState.isLoading = false;
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
    useFlowEditorStore.setState({ editName: 'irgendwas' });
  });

  it('listet die Flows als Slash-Namen', () => {
    render(<FlowsPanel />);
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.getByText('/notiz')).toBeInTheDocument();
  });

  it('ein Klick öffnet den Flow-Editor-Tab mit dem Ziel', () => {
    render(<FlowsPanel />);
    fireEvent.click(screen.getByTestId('flow-open-recherche'));
    expect(useFlowEditorStore.getState().editName).toBe('recherche');
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('flow');
    expect(useWorkspaceStore.getState().activeTabId).toBe('flow');
  });

  it('»Neuer Flow« öffnet den Editor-Tab leer', () => {
    render(<FlowsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Flow' }));
    expect(useFlowEditorStore.getState().editName).toBeNull();
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('flow');
  });

  it('zeigt eine Anlege-Aufforderung, wenn keine Flows da sind', () => {
    flowsState.flows = [];
    render(<FlowsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Flow anlegen' }));
    expect(useFlowEditorStore.getState().editName).toBeNull();
    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toContain('flow');
  });

  it('zeigt alle Flows, global zuerst, dann je Projekt gruppiert (seit B2 ohne aktives Projekt)', () => {
    flowsState.flows = [
      { name: 'global-flow', beschreibung: 'global' },
      { name: 'eigen', beschreibung: 'eins', projekt: { id: 'ws1', name: 'Eins' } },
      { name: 'fremd', beschreibung: 'zwei', projekt: { id: 'ws2', name: 'Zwei' } },
    ];
    render(<FlowsPanel />);
    expect(screen.getByText('/global-flow')).toBeInTheDocument();
    expect(screen.getByText('/eigen')).toBeInTheDocument();
    expect(screen.getByText('/fremd')).toBeInTheDocument();
    expect(screen.getByTestId('flow-gruppe-ws1')).toBeInTheDocument();
    expect(screen.getByTestId('flow-gruppe-ws2')).toBeInTheDocument();
  });
});
