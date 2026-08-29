/**
 * Ein App-Tab überlebt den Weg in die Einstellungen (Phase H2).
 *
 * Warum das eine eigene Datei wert ist: es ist EIN Filter in `TabContent`,
 * und wer ihn wieder auf „nur der aktive Tab" zurückstellt, bricht damit
 * nichts, was sichtbar rot würde. Die App im Rahmen fängt dann bloß jedes
 * Mal von vorn an — ein halb ausgefülltes Formular ist weg, und beim
 * Theme-Wechsel lädt der Rahmen neu, obwohl `AppRahmen` ihn gar nicht
 * anfasst. Das sieht man einem Bildschirmfoto nicht an.
 *
 * Alle anderen Tabs sind Ansichten dieser Shell und sollen NICHT stehen
 * bleiben: ihr Zustand liegt im Query-Cache über der Shell. Beide Richtungen
 * stehen deshalb unten.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, isAuthenticated: true }),
}));

// Die Inhalte sind hier nicht der Gegenstand — gemessen wird, WAS im Dokument
// steht und was nicht.
vi.mock('@/features/apps/AppRahmen', () => ({
  AppRahmen: ({ appId }: { appId: string }) => <div data-testid={`rahmen-${appId}`} />,
}));
vi.mock('@/features/apps/Uebersicht', () => ({
  Uebersicht: () => <div data-testid="uebersicht" />,
}));
vi.mock('@/features/freigaben/OffeneFreigaben', () => ({
  OffeneFreigaben: () => null,
}));
vi.mock('@/features/modelle/ModelleAnsicht', () => ({
  default: () => <div data-testid="modelle" />,
}));
vi.mock('@/features/settings/Settings', () => ({
  default: () => <div data-testid="einstellungen" />,
}));

import { TabContent } from '../TabContent';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const steuerung = { onLogout: async () => {} };

function zeige() {
  render(<TabContent handgriffe={steuerung} />);
}

describe('welche Tabs im Dokument stehen', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
  });

  it('ein App-Tab bleibt stehen, wenn ein anderer Tab vorn ist — nur versteckt', () => {
    const store = useWorkspaceStore.getState();
    store.openTab({ type: 'app', appId: 'urlaub', stand: 'live' });
    store.openTab({ type: 'settings' });
    zeige();

    const rahmen = screen.getByTestId('rahmen-urlaub');
    expect(rahmen).toBeInTheDocument();
    // `hidden` sitzt am Kasten des Tabs, nicht am Rahmen selbst.
    expect(rahmen.closest('[data-tab-path]')).toHaveAttribute('hidden');
  });

  it('zwei offene Apps bleiben beide stehen', () => {
    const store = useWorkspaceStore.getState();
    store.openTab({ type: 'app', appId: 'urlaub', stand: 'live' });
    store.openTab({ type: 'app', appId: 'spesen', stand: 'live' });
    store.openTab({ type: 'dashboard' });
    zeige();

    expect(screen.getByTestId('rahmen-urlaub')).toBeInTheDocument();
    expect(screen.getByTestId('rahmen-spesen')).toBeInTheDocument();
    expect(screen.getByTestId('uebersicht')).toBeInTheDocument();
  });

  /**
   * Die andere Richtung, und sie ist genauso wichtig: das hier ist KEIN
   * „alle Tabs bleiben stehen". Eine Ansicht der Shell holt ihre Daten aus
   * dem Query-Cache und sieht nach dem Neuaufbau genauso aus — sie stehen zu
   * lassen kostet Speicher für nichts.
   *
   * Geprüft an der Übersicht, weil sie direkt rendert. Einstellungen und
   * Modelle kommen über `React.lazy`: die stehen im ersten Durchgang ohnehin
   * nicht da, und ein Test gegen sie wäre grün, ohne etwas zu behaupten.
   */
  it('eine Ansicht der Shell dagegen wird abgeräumt, sobald sie nicht vorn ist', () => {
    const store = useWorkspaceStore.getState();
    store.openTab({ type: 'dashboard' });
    store.openTab({ type: 'app', appId: 'urlaub', stand: 'live' });
    zeige();

    expect(screen.getByTestId('rahmen-urlaub')).toBeInTheDocument();
    expect(screen.queryByTestId('uebersicht')).not.toBeInTheDocument();
  });
});
