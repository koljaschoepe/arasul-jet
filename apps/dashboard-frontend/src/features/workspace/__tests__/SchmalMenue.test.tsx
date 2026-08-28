/**
 * Tests: das Hamburger-Menue unter 900 px (Phase D7, 28.08.2026).
 *
 * Es ersetzt dort Aktivitaetsleiste UND Sidebar, und es ersetzt sie nicht als
 * geschrumpfte Kopie: die Leiste hatte zwei Stufen (erst die Ansicht waehlen,
 * dann darin klicken), hier ist jeder Eintrag ein Ziel. Gemessen wird genau
 * das -- ein Tipp, ein Ort -- und die Regel, dass jede Ansicht das Menue
 * wieder zumacht.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { SchmalMenue } from '../SchmalMenue';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const meineApps = vi.fn();
vi.mock('@/features/apps/meineApps', async () => {
  const echt = await vi.importActual<typeof import('@/features/apps/meineApps')>(
    '@/features/apps/meineApps'
  );
  return { ...echt, useMeineApps: () => meineApps() };
});

function zeige() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SchmalMenue />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
    notizenAnsichtOffen: false,
    menueOffen: true,
  });
  angemeldet({ role: 'mitarbeiter', username: 'mia' });
  meineApps.mockReturnValue({
    data: [
      {
        id: 'urlaub',
        name: 'Urlaubsantrag',
        beschreibung: null,
        live: { version: '1.0.0', pfad: '/apps/urlaub/' },
        test: null,
      },
    ],
    isLoading: false,
    isError: false,
  });
});

describe('Das Hamburger-Menue', () => {
  it('steht gar nicht da, solange es zu ist', () => {
    useWorkspaceStore.setState({ menueOffen: false });
    zeige();
    expect(screen.queryByTestId('workspace-schmal-menue')).not.toBeInTheDocument();
  });

  it('fuehrt Uebersicht, die eigenen Apps und die Notizen -- jeder Eintrag ein Ziel', () => {
    zeige();
    expect(screen.getByTestId('menue-uebersicht')).toBeInTheDocument();
    expect(screen.getByTestId('menue-app-urlaub-live')).toHaveTextContent('Urlaubsantrag');
    expect(screen.getByTestId('menue-notizen')).toBeInTheDocument();
  });

  it('oeffnet eine App und macht sich dabei zu', () => {
    zeige();
    fireEvent.click(screen.getByTestId('menue-app-urlaub-live'));
    const stand = useWorkspaceStore.getState();
    expect(stand.activeTabId).toBe('app:urlaub:live');
    expect(stand.menueOffen).toBe(false);
    expect(stand.notizenAnsichtOffen).toBe(false);
  });

  /**
   * Der Fall, den die Shell allein nicht faengt: wer die Uebersicht waehlt,
   * waehrend sie schon der aktive Tab ist, aendert nichts -- und ohne das
   * Zumachen hier bliebe das Menue offen stehen.
   */
  it('macht sich auch dann zu, wenn die gewaehlte Ansicht schon dasteht', () => {
    useWorkspaceStore.setState({
      tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Übersicht' }],
      activeTabId: 'dashboard',
    });
    zeige();
    fireEvent.click(screen.getByTestId('menue-uebersicht'));
    expect(useWorkspaceStore.getState().menueOffen).toBe(false);
  });

  it('schaltet die Notizen als Ansicht ein, statt sie ueber etwas zu legen', () => {
    zeige();
    fireEvent.click(screen.getByTestId('menue-notizen'));
    expect(useWorkspaceStore.getState().notizenAnsichtOffen).toBe(true);
    expect(useWorkspaceStore.getState().menueOffen).toBe(false);
  });

  it('zeigt einem Mitarbeiter keine Verwaltung und dem Administrator beides', () => {
    zeige();
    expect(screen.queryByTestId('menue-einstellungen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menue-modelle')).not.toBeInTheDocument();

    angemeldet({ role: 'admin', username: 'admin' });
    zeige();
    expect(screen.getAllByTestId('menue-einstellungen').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('menue-modelle').length).toBeGreaterThan(0);
  });

  it('geht mit Escape zu -- wer es aufmacht, muss auch wieder heraus', () => {
    zeige();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useWorkspaceStore.getState().menueOffen).toBe(false);
  });

  /**
   * Die Tabulatorfalle. Ohne sie liefe der Fokus hinter das offene Menue in
   * eine Seite weiter, die der Mensch gar nicht sieht -- derselbe Fehler, den
   * `scripts/test/bausteine.py` an handgebauten Dialogen aufhaelt.
   */
  it('haelt den Fokus drin: er faengt im Menue an und springt am Ende zurueck', () => {
    zeige();
    const flaeche = screen.getByTestId('workspace-schmal-menue');
    const halte = [...flaeche.querySelectorAll('button')];
    expect(document.activeElement).toBe(halte[0]);

    const letzter = halte[halte.length - 1] as HTMLElement;
    letzter.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(halte[0]);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(letzter);
  });
});
