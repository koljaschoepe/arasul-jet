import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceMenuBar } from '../WorkspaceMenuBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeView: 'apps',
    sidebarVisible: true,
    rightPanelVisible: true,
    notizenBlattOffen: false,
  });
}

/**
 * Ein matchMedia-Doppel: `schmal` sagt, ob `(max-width: 899px)` passt. Der
 * Notizen-Knopf ist EINER, aber unter 900 px schaltet er das Blatt ueber der
 * Mitte und nicht die Spalte daneben (Phase D6) — die gibt es dort nicht.
 */
function fensterbreite(schmal: boolean) {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: schmal,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

const abmelden = vi.fn();

describe('WorkspaceMenuBar', () => {
  beforeEach(() => {
    resetStore();
    angemeldet({ role: 'admin' });
    abmelden.mockReset();
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
  });

  it('rendert Marke und den Settings-Button rechts', () => {
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    expect(screen.getByText('Arasul')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('hat kein Datei-Menü mehr (Explorer und Terminal sind mit B2 gefallen)', () => {
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    expect(screen.queryByLabelText('Datei-Menü')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ansicht-Menü')).not.toBeInTheDocument();
  });

  it('Settings-Button öffnet den Einstellungen-Tab und die Bereiche links', () => {
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
    expect(useWorkspaceStore.getState().activeView).toBe('settings');
  });

  it('zeigt genau zwei Layout-Toggles rechts, die den Store spiegeln und schalten', () => {
    render(<WorkspaceMenuBar onLogout={abmelden} />);

    const layoutGroup = screen.getByRole('group', { name: 'Layout' });
    expect(layoutGroup.querySelectorAll('button')).toHaveLength(2);

    const sidebar = screen.getByLabelText('Sidebar ausblenden');
    const panel = screen.getByLabelText('Notizen ausblenden');
    expect(sidebar).toHaveAttribute('aria-pressed', 'true');
    expect(panel).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(sidebar);
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false);

    fireEvent.click(panel);
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);

    fireEvent.click(screen.getByLabelText('Notizen einblenden'));
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
  });

  it('schaltet unter 900 px das Notizen-Blatt und laesst die Spalten-Voreinstellung in Ruhe', () => {
    const zurueck = fensterbreite(true);
    try {
      render(<WorkspaceMenuBar onLogout={abmelden} />);
      // Zu, obwohl `rightPanelVisible` true ist: das Blatt faengt immer zu an.
      fireEvent.click(screen.getByLabelText('Notizen einblenden'));
      expect(useWorkspaceStore.getState().notizenBlattOffen).toBe(true);
      expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
    } finally {
      zurueck();
    }
  });

  it('bietet keine Design-/Theme-Auswahl in der Menüleiste', () => {
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    expect(
      screen.queryByRole('menuitemradio', { name: /Schwarz|Dunkel|Hell/ })
    ).not.toBeInTheDocument();
  });

  it('zeigt einem Mitarbeiter kein Einstellungen-Zahnrad', () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    expect(screen.queryByLabelText('Einstellungen')).not.toBeInTheDocument();
  });

  /**
   * Der Grund, warum es das Benutzermenü gibt: das Abmelden lag bis D1 IN den
   * Einstellungen, und die sind jetzt eine Admin-Seite. Ohne diesen Weg wäre
   * ein Mitarbeiter eingesperrt.
   */
  it('bietet jedem, auch dem Mitarbeiter, Name und Rolle und Abmelden', () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    render(<WorkspaceMenuBar onLogout={abmelden} />);
    fireEvent.click(screen.getByTestId('workspace-benutzermenue'));
    expect(screen.getByText('mia')).toBeInTheDocument();
    expect(screen.getByText('Mitarbeiter')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('workspace-abmelden'));
    expect(abmelden).toHaveBeenCalled();
  });
});
