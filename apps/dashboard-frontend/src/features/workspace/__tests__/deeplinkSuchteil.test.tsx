/**
 * Deep-Link mit Suchteil bis in den Tab (Plan 023 B1, Nachtrag).
 *
 * Jeder Feature-Tab läuft in einem eigenen MemoryRouter. Dessen Startpfad kam
 * aus `initialPathFor` und enthielt nur den Pfad. Ein Aufruf von
 * `/workspace/settings?tab=remote-access` startete den Tab-Router deshalb mit
 * `/settings` ohne Suchteil, und `Settings.tsx` las über `useSearchParams` eine
 * leere Location: der Deep-Link zum Fernzugriff landete stumm auf „Allgemein".
 *
 * Am 19.08.2026 live am Gerät reproduziert, vorher und nachher.
 *
 * Geprüft wird die echte `FeatureTabHost` aus TabContent, nicht eine
 * Nachbildung. Nur `Settings` selbst ist ersetzt, damit der Test nicht die
 * halbe Einstellungsseite mitzieht.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams, useLocation } from 'react-router-dom';

vi.mock('@/features/settings/Settings', () => ({
  default: () => {
    const [params] = useSearchParams();
    const ort = useLocation();
    return (
      <span data-testid="gelesen">{`${ort.pathname}|${params.get('tab') ?? 'kein-parameter'}`}</span>
    );
  },
}));

import { FeatureTabHost } from '../TabContent';
import type { WorkspaceTab } from '@/stores/workspaceStore';

const einstellungenTab = {
  id: 'settings',
  type: 'settings',
  title: 'Einstellungen',
} as WorkspaceTab;

const steuerung = {
  onLogout: async () => {},
};

async function zeige(adresse: string) {
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route
          path="/workspace/settings"
          element={<FeatureTabHost tab={einstellungenTab} handgriffe={steuerung} />}
        />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByTestId('gelesen')).toBeInTheDocument());
  return screen.getByTestId('gelesen').textContent;
}

describe('Suchteil erreicht den Tab-Router', () => {
  test('der Deep-Link zum Fernzugriff kommt an', async () => {
    expect(await zeige('/workspace/settings?tab=remote-access')).toBe('/settings|remote-access');
  });

  test('ohne Suchteil bleibt es beim reinen Pfad', async () => {
    expect(await zeige('/workspace/settings')).toBe('/settings|kein-parameter');
  });
});
