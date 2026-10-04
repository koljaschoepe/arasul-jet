/**
 * Tests: der Rahmen der Shell (M5) und der Abgleich von Adresse und Ansicht.
 *
 * 1. Es gibt keine Kopfleiste, keine Tab-Leiste, keine Spalten: nur
 *    Aktivitätsleiste, eine Ansicht und die Statusleiste.
 * 2. `/workspace` landet auf der Startseite, eine Admin-Adresse für einen
 *    Mitarbeiter ebenfalls, ein unbekannter Pfad auch.
 * 3. Deep-Links öffnen ihre Ansicht, alte Lesezeichen (`/workspace/modelle`,
 *    `?tab=`) den passenden Bereich der Verwaltung.
 */
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import WorkspaceShell from '../WorkspaceShell';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('../ActivityBar', () => ({ ActivityBar: () => <nav data-testid="mock-leiste" /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <footer data-testid="mock-statusleiste" /> }));
vi.mock('../AnsichtInhalt', () => ({ AnsichtInhalt: () => <div data-testid="mock-ansicht" /> }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function Zurueck() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      zurück
    </button>
  );
}

function renderShell(initialPath: string, davor: string[] = []) {
  return render(
    <MemoryRouter initialEntries={[...davor, initialPath]} initialIndex={davor.length}>
      <Routes>
        <Route path="/workspace/*" element={<WorkspaceShell onLogout={async () => {}} />} />
      </Routes>
      <LocationProbe />
      <Zurueck />
    </MemoryRouter>
  );
}

async function landetAuf(pfad: string) {
  await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe(pfad));
}

describe('WorkspaceShell', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
    angemeldet({ role: 'admin' });
  });

  it('besteht nur aus Leiste, Ansicht und Statusleiste', async () => {
    renderShell('/workspace');
    const shell = await screen.findByTestId('workspace-shell');
    expect(screen.getByTestId('mock-leiste')).toBeInTheDocument();
    expect(screen.getByTestId('mock-ansicht')).toBeInTheDocument();
    expect(screen.getByTestId('mock-statusleiste')).toBeInTheDocument();
    expect(shell.querySelector('header')).toBeNull();
    expect(shell.querySelector('[data-panel]')).toBeNull();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // Eine Flächenfarbe (DESIGN.md): die Ansicht liegt auf bg-background.
    expect(screen.getByTestId('workspace-ansicht')).toHaveClass('bg-background');
  });

  it('ohne Deep-Link landet der Workspace auf der Startseite', async () => {
    renderShell('/workspace');
    await landetAuf('/workspace/dashboard');
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'dashboard' });
  });

  it('ein App-Deep-Link öffnet diese App, der Teststand seinen eigenen', async () => {
    renderShell('/workspace/app/beispielapp/test');
    await waitFor(() =>
      expect(useWorkspaceStore.getState().ansicht).toEqual({
        type: 'app',
        appId: 'beispielapp',
        stand: 'test',
      })
    );
    await landetAuf('/workspace/app/beispielapp/test');
  });

  it('ein Wechsel im Store schreibt die Adresse', async () => {
    renderShell('/workspace');
    await landetAuf('/workspace/dashboard');
    act(() => useWorkspaceStore.getState().oeffne({ type: 'verwaltung', bereich: 'benutzer' }));
    await landetAuf('/workspace/verwaltung/benutzer');
  });

  it('das alte Lesezeichen der Modelle öffnet den Bereich der Verwaltung', async () => {
    renderShell('/workspace/modelle');
    await landetAuf('/workspace/verwaltung/modelle');
  });

  it('ein alter ?tab= landet auf dem Bereich (Sicherung im Bereich Daten)', async () => {
    renderShell('/workspace/verwaltung?tab=sicherung');
    await landetAuf('/workspace/verwaltung/daten');
    expect(useWorkspaceStore.getState().ansicht).toEqual({
      type: 'verwaltung',
      bereich: 'daten',
    });
  });

  it.each(['/workspace/verwaltung/privacy', '/workspace/verwaltung/system/werksreset'])(
    'die gestrichene Adresse %s führt in den Bereich Daten',
    async pfad => {
      renderShell(pfad);
      await landetAuf('/workspace/verwaltung/daten');
    }
  );

  it('/workspace/settings?tab= aus der Zeit vor M5 führt in die Verwaltung', async () => {
    renderShell('/workspace/settings?tab=remote-access');
    await landetAuf('/workspace/verwaltung/remote-access');
  });

  it('/workspace/settings ohne ?tab= sind die persönlichen Einstellungen', async () => {
    renderShell('/workspace/settings');
    await landetAuf('/workspace/settings');
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'settings' });
  });

  /**
   * Ausblenden, keine Berechtigung: `requireRole` im Backend antwortet einem
   * Mitarbeiter auf jeden Weg hinter der Verwaltung mit 403. Hier geht es nur
   * darum, dass eine getippte Adresse ihn nicht in eine Sackgasse führt.
   */
  it('einem Mitarbeiter führt /workspace/verwaltung auf die Startseite', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    renderShell('/workspace/verwaltung/benutzer');
    await landetAuf('/workspace/dashboard');
  });

  it('ein unbekannter Pfad öffnet nichts (Terminal ist mit B2 gefallen)', async () => {
    renderShell('/workspace/terminal');
    await landetAuf('/workspace/dashboard');
  });

  it('ein altes Lesezeichen wird ersetzt: ein Zurück führt eine Seite zurück', async () => {
    renderShell('/workspace/modelle', ['/workspace/settings']);
    await landetAuf('/workspace/verwaltung/modelle');
    act(() => screen.getByText('zurück').click());
    await landetAuf('/workspace/settings');
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'settings' });
  });

  it('ein Klick in der Leiste ist ein Schritt im Verlauf', async () => {
    renderShell('/workspace/dashboard');
    await landetAuf('/workspace/dashboard');
    act(() => useWorkspaceStore.getState().oeffne({ type: 'settings' }));
    await landetAuf('/workspace/settings');
    act(() => screen.getByText('zurück').click());
    await landetAuf('/workspace/dashboard');
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'dashboard' });
  });

  it('der Titel des Browser-Tabs sagt, was offen ist', async () => {
    renderShell('/workspace/settings');
    await waitFor(() => expect(document.title).toBe('Einstellungen – Arasul'));
  });
});
