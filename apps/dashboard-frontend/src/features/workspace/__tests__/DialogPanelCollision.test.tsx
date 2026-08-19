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
 *
 * Seit dem Ein-Ordner-Modell laufen die Explorer-Dialoge über Modal/
 * ConfirmModal (beide Radix-basiert) direkt im ExplorerPanel — getestet wird
 * hier deshalb genau diese Dialog-Schicht neben der Shell.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ToastProvider } from '@/contexts/ToastContext';
import WorkspaceShell from '../WorkspaceShell';
import Modal, { ConfirmModal } from '@/components/ui/Modal';

// Schwere Shell-Kinder mocken — getestet wird die Panel-/Dialog-Interaktion.
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../QuickOpen', () => ({ QuickOpen: () => null }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
vi.mock('../explorer/ExplorerPanel', () => ({
  ExplorerPanel: () => <div data-testid="mock-explorer" />,
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
      <Modal isOpen onClose={() => {}} title="Neuer Ordner" size="small">
        <p>Dialog-Inhalt</p>
      </Modal>
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
  const cases: { name: string; dialog: React.ReactNode; open: RegExp | string }[] = [
    {
      name: 'Name-Dialog (Neue Datei / Neuer Ordner / Umbenennen)',
      dialog: (
        <Modal isOpen onClose={() => {}} title="Neuer Ordner" size="small">
          <p>Ordnername</p>
        </Modal>
      ),
      open: 'Neuer Ordner',
    },
    {
      name: 'Bestätigungs-Dialog (Löschen)',
      dialog: (
        <ConfirmModal
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          title="Datei löschen"
          message="„notiz.md“ wirklich löschen?"
          confirmText="Löschen"
          confirmVariant="danger"
        />
      ),
      open: 'Datei löschen',
    },
  ];

  it.each(cases)(
    '$name, Sidebar, Chat und rechtes Panel bleiben sichtbar',
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
          <ToastProvider>{dialog}</ToastProvider>
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
