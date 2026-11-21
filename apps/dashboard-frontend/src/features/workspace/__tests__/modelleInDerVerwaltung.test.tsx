/**
 * Die Modelle als Bereich der Verwaltung (M5), durch die echte Kette:
 * `AnsichtWeiche` reicht `ModelleAnsicht` als Slot in die Verwaltung, die
 * Verwaltung zeigt ihn unter dem Bereich `modelle`. Bis M5 waren die Modelle
 * eine eigene Ansicht der Aktivitätsleiste mit eigenem Tab.
 *
 * UNTER LAST WAR ER ROT (Nachtrag 21.11.2026): die Verwaltung kommt über
 * `lazyMitVorladen`, und beim ersten Rendern übersetzt Vitest erst den ganzen
 * Baum aus `features/settings/` (alle Bereiche der Verwaltung). Lief die ganze
 * Reihe neben anderen Prozessen, dauerte das länger als die eine Sekunde, die
 * `waitFor` von sich aus wartet. Jetzt wird das Modul vor dem Test geladen,
 * mit eigener Frist, und das Warten im Test hat zehn Sekunden: gemessen wird
 * hier, WAS erscheint, nicht wie schnell der Rechner übersetzt.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { AnsichtWeiche } from '../AnsichtInhalt';

// Die Verwaltung liest das Kennzeichen Entwickler (J42, M7).
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'chef', role: 'admin', entwickler: false } }),
}));

vi.mock('@/features/modelle/ModelleAnsicht', () => ({
  default: () => <div data-testid="modelle-bereich">Kurzliste</div>,
}));

beforeAll(async () => {
  await import('@/features/settings/Settings');
}, 60_000);

test('der Bereich Modelle zeigt die Kurzliste, links die Bereiche', async () => {
  const ansicht = { type: 'verwaltung', bereich: 'modelle' } as const;
  useWorkspaceStore.setState({ ansicht });
  render(
    <MemoryRouter>
      <AnsichtWeiche ansicht={ansicht} />
    </MemoryRouter>
  );
  expect(
    await screen.findByTestId('modelle-bereich', undefined, { timeout: 10_000 })
  ).toBeInTheDocument();
  expect(screen.getByTestId('verwaltung-modelle')).toHaveAttribute('aria-current', 'page');
}, 20_000);
