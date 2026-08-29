/**
 * Tests: Radix-Dialoge kollabieren die Keep-alive-Panels NICHT
 * (Plan 003 · Schritt 2 · Bug b — ein Dialog ließ Sidebar + rechtes Panel
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
 * Der Explorer, dessen Dialoge den Fall ausgelöst hatten, ist mit B2
 * gefallen; die Regel gilt für jeden Dialog neben der Shell, deshalb bleibt
 * der Test mit `Dialogform` und `Bestaetigung` aus `@marken` (bis H5:
 * `Modal` und `ConfirmModal` der Shell).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ToastProvider } from '@/contexts/ToastContext';
import WorkspaceShell from '../WorkspaceShell';
import { Bestaetigung, Dialogform } from '@marken';

// Schwere Shell-Kinder mocken — getestet wird die Panel-/Dialog-Interaktion.
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <div /> }));
vi.mock('../WorkspaceMenuBar', () => ({ WorkspaceMenuBar: () => <div /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div /> }));
vi.mock('../TabBar', () => ({ TabBar: () => <div /> }));
vi.mock('../TabContent', () => ({ TabContent: () => <div data-testid="mock-tabcontent" /> }));
// Seit D1 tragen die beiden Spalten Inhalt (App-Liste, Notizen), der eigene
// Abfragen stellt. Hier geht es um die Panels, nicht um das, was darin steht.
vi.mock('../SidebarHost', () => ({ SidebarHost: () => <div data-testid="mock-sidebar" /> }));
vi.mock('../RightPanel', () => ({ RightPanel: () => <div data-testid="mock-rightpanel" /> }));
function resetStore() {
  useWorkspaceStore.setState({
    tabs: [{ id: 'settings', type: 'settings', title: 'Einstellungen' }],
    activeTabId: 'settings',
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
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
      <Dialogform offen beiSchliessen={() => {}} titel="Neuer Eintrag" groesse="klein">
        <p>Dialog-Inhalt</p>
      </Dialogform>
    );
    await waitFor(() => expect(screen.getByText('Neuer Eintrag')).toBeInTheDocument());

    // hideOthers hat den Nachbarn vor Screenreadern verborgen …
    expect(orphan.getAttribute('aria-hidden')).toBe('true');
    // … hätte die Versteck-Regel an aria-hidden gehangen, wäre das Panel jetzt
    // display:none. data-shell-hidden bleibt unberührt (nur die Shell setzt es),
    // deshalb kollabiert unter der neuen Regel nichts.
    expect(orphan.getAttribute('data-shell-hidden')).toBe('false');
  });
});

describe('Fix: offene Dialoge lassen die Shell-Spalten sichtbar', () => {
  const cases: { name: string; dialog: React.ReactNode; open: RegExp | string }[] = [
    {
      name: 'Name-Dialog',
      dialog: (
        <Dialogform offen beiSchliessen={() => {}} titel="Neuer Eintrag" groesse="klein">
          <p>Name</p>
        </Dialogform>
      ),
      open: 'Neuer Eintrag',
    },
    {
      name: 'Bestätigungs-Dialog (Löschen)',
      dialog: (
        <Bestaetigung
          offen
          beiSchliessen={() => {}}
          beiBestaetigen={() => {}}
          titel="Eintrag löschen"
          frage="„notiz“ wirklich löschen?"
          jaText="Löschen"
          art="gefahr"
        />
      ),
      open: 'Eintrag löschen',
    },
  ];

  it.each(cases)('$name, Sidebar und rechte Spalte bleiben sichtbar', async ({ dialog, open }) => {
    render(
      <>
        <MemoryRouter initialEntries={['/workspace/settings']}>
          <Routes>
            <Route path="/workspace/*" element={<WorkspaceShell onLogout={async () => {}} />} />
          </Routes>
        </MemoryRouter>
        <ToastProvider>{dialog}</ToastProvider>
      </>
    );

    // Dialog ist offen …
    await waitFor(() => expect(screen.getByText(open)).toBeInTheDocument());

    // … und die sichtbaren Spalten bleiben es: data-shell-hidden ist nirgends
    // fälschlich auf 'true' gekippt.
    const sidebar = document.querySelector<HTMLElement>('[data-panel]#sidebar');
    const rechts = document.querySelector<HTMLElement>('[data-panel]#right');

    expect(sidebar).not.toBeNull();
    expect(rechts).not.toBeNull();
    expect(sidebar).toHaveAttribute('data-shell-hidden', 'false');
    expect(rechts).toHaveAttribute('data-shell-hidden', 'false');
  });
});
