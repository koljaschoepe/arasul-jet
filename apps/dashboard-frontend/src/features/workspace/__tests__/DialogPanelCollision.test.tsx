/**
 * Tests: Radix-Dialoge kollabieren die Keep-alive-Panels NICHT mehr
 * (Plan 003 · Schritt 2 · Bug b — „Neuer Ordner" ließ Sidebar + Chat
 * verschwinden).
 *
 * URSACHE (im DOM verifiziert): Ein modaler Radix-Dialog ruft beim Öffnen
 * `hideOthers()` aus dem `aria-hidden`-Paket auf und setzt `aria-hidden='true'`
 * auf fremde Nachbar-Elemente, um sie vor Screenreadern zu verbergen. Die
 * frühere Keep-alive-Regel `[data-panel][aria-hidden='true'] { display:none }`
 * hing an genau diesem Attribut — sobald der Dialog ein `[data-panel]` als
 * Nachbarn markierte, verschwand das Panel.
 *
 * FIX: Die Sichtbarkeit hängt jetzt an `data-shell-hidden`, das AUSSCHLIESSLICH
 * die Shell setzt. `aria-hidden` wird für die A11y weiter gespiegelt, steuert
 * aber die Darstellung nicht mehr.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ToastProvider } from '@/contexts/ToastContext';
import WorkspaceShell from '../WorkspaceShell';
import { ExplorerDialogs } from '../explorer/ExplorerDialogs';
import type { ExplorerDialogState } from '../explorer/ExplorerDialogs';
import type { TreeSpace, TreeDocument } from '../explorer/ExplorerPanel';

// Schwere Shell-Kinder mocken — getestet wird die Panel-/Dialog-Interaktion.
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div /> }));
vi.mock('../SidebarFooter', () => ({ SidebarFooter: () => <div /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
// ExplorerPanel-Mock: die echten ExplorerDialogs importieren collectSubtreeIds
// aus diesem Modul, daher hier mitliefern.
vi.mock('../explorer/ExplorerPanel', () => ({
  ExplorerPanel: () => <div data-testid="mock-explorer" />,
  collectSubtreeIds: () => [],
}));
vi.mock('../llm/ChatPanel', () => ({ ChatPanel: () => <div data-testid="mock-chat" /> }));
vi.mock('../terminal/TerminalPanel', () => ({
  TerminalPanel: () => <div data-testid="mock-terminal" />,
}));
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [],
    isLoading: false,
    isAppEnabled: () => true,
    isTabTypeEnabled: () => true,
    setAppEnabled: vi.fn(),
  }),
}));
// ExplorerDialogs laufen über useApi (context-file lädt beim Öffnen).
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({ content: null }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
  }),
}));

const space: TreeSpace = {
  id: 's1',
  name: 'Ordner A',
  slug: 'ordner-a',
  icon: null,
  color: null,
  parent_id: null,
  is_default: false,
  is_system: false,
  sort_order: 0,
};
const doc: TreeDocument = {
  id: 'd1',
  filename: 'notiz.pdf',
  title: null,
  status: 'indexed',
  space_id: null,
  is_context_file: false,
  mime_type: null,
  file_extension: null,
  file_size: null,
};

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
    activeTabId: 'settings',
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
});
afterEach(() => {
  document.querySelectorAll('[data-testid="orphan-panel"]').forEach(n => n.remove());
});

describe('Ursache: Radix hideOthers ↔ aria-hidden-Kopplung', () => {
  it('ein Radix-Dialog kippt aria-hidden auf ein [data-panel]-Nachbarelement (Beleg der Kopplung)', async () => {
    // Ein Panel als direkter Body-Nachbar des Dialog-Portals — genau die
    // Konstellation, die der alte Selektor `[data-panel][aria-hidden='true']`
    // fälschlich versteckt hätte.
    const orphan = document.createElement('div');
    orphan.setAttribute('data-panel', '');
    orphan.setAttribute('aria-hidden', 'false');
    orphan.setAttribute('data-shell-hidden', 'false');
    orphan.setAttribute('data-testid', 'orphan-panel');
    document.body.appendChild(orphan);

    render(
      <ToastProvider>
        <ExplorerDialogs
          dialog={{ kind: 'create', parent: null }}
          onClose={() => {}}
          onChanged={() => {}}
        />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Neuer Ordner')).toBeInTheDocument());

    // hideOthers hat den Nachbarn vor Screenreadern verborgen …
    expect(orphan.getAttribute('aria-hidden')).toBe('true');
    // … hätte die Versteck-Regel an aria-hidden gehangen, wäre das Panel jetzt
    // display:none. data-shell-hidden bleibt unberührt (nur die Shell setzt es),
    // deshalb kollabiert unter der neuen Regel nichts.
    expect(orphan.getAttribute('data-shell-hidden')).toBe('false');
  });
});

describe('Fix: offene Explorer-Dialoge lassen die Shell-Panels sichtbar', () => {
  const cases: { name: string; dialog: ExplorerDialogState; open: RegExp | string }[] = [
    {
      name: 'Neuer Ordner (create-folder)',
      dialog: { kind: 'create', parent: null },
      open: 'Neuer Ordner',
    },
    {
      name: 'Neuer Unterordner (create in parent)',
      dialog: { kind: 'create', parent: space },
      open: /Neuer Unterordner/,
    },
    { name: 'Umbenennen (rename)', dialog: { kind: 'rename', space }, open: 'Ordner umbenennen' },
    {
      name: 'Verschieben (move)',
      dialog: { kind: 'move', space, spaces: [space] },
      open: /verschieben/,
    },
    { name: 'Löschen (delete)', dialog: { kind: 'delete', space }, open: /löschen/ },
    {
      name: 'Dokument verschieben (move-document)',
      dialog: { kind: 'move-document', document: doc, spaces: [space] },
      open: /verschieben/,
    },
    {
      name: 'Kontextdatei (context-file)',
      dialog: { kind: 'context-file', space },
      open: /Kontextdatei/,
    },
  ];

  it.each(cases)(
    '$name — Sidebar, Chat und rechtes Panel bleiben sichtbar',
    async ({ dialog, open }) => {
      render(
        <>
          <MemoryRouter initialEntries={['/workspace/settings']}>
            <Routes>
              <Route
                path="/workspace/*"
                element={
                  <WorkspaceShell theme="dark" onToggleTheme={() => {}} onLogout={async () => {}} />
                }
              />
            </Routes>
          </MemoryRouter>
          <ToastProvider>
            <ExplorerDialogs dialog={dialog} onClose={() => {}} onChanged={() => {}} />
          </ToastProvider>
        </>
      );

      // Dialog ist offen …
      await waitFor(() => expect(screen.getByText(open)).toBeInTheDocument());

      // … und die sichtbaren Flächen bleiben es: data-shell-hidden ist nirgends
      // fälschlich auf 'true' gekippt (der Bug ließ Sidebar + Chat verschwinden).
      // Chat lebt seit Schritt 4 als [data-shell-surface] im RightPanel (kein
      // eigenes react-resizable-panels-Panel mehr); Explorer + das rechte Panel
      // (#llm) sind weiterhin echte Panels.
      const explorer = document.querySelector<HTMLElement>('[data-panel]#explorer');
      const llm = document.querySelector<HTMLElement>('[data-panel]#llm');
      const chatSurface = document.querySelector<HTMLElement>('[data-shell-surface="chat"]');

      expect(explorer).not.toBeNull();
      expect(llm).not.toBeNull();
      expect(chatSurface).not.toBeNull();

      expect(explorer).toHaveAttribute('data-shell-hidden', 'false');
      expect(llm).toHaveAttribute('data-shell-hidden', 'false');
      expect(chatSurface).toHaveAttribute('data-shell-hidden', 'false');
    }
  );
});
