/**
 * Modelle und Erweiterungen als eigene Tabs, durch den echten Weg (Plan 023 B7).
 *
 * Beim Aufteilen des einen „Extensions"-Tabs in zwei ist genau hier ein Fehler
 * entstanden, den die anderen Tests nicht sehen konnten: `routeFor` bekam den
 * Tab-Typ als Schlüssel, `SELF_KEYS` hält aber den ROUTEN-Namen. Damit war
 * `self.has(key)` immer falsch, die Route fiel auf die Brücke zurück und der
 * Tab blieb dauerhaft leer.
 *
 * Aufgefallen ist das im Review, nicht im Testlauf, weil sämtliche Store-Tests
 * `<Store bereich=… />` direkt rendern und die Verdrahtung dazwischen
 * überspringen. Dieser Test geht deshalb durch `FeatureTabHost`, also durch
 * dieselbe Kette wie die Anwendung.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/features/store', () => ({
  default: ({ bereich }: { bereich: string }) => <div data-testid="store-bereich">{bereich}</div>,
}));

import { FeatureTabHost } from '../TabContent';
import type { WorkspaceTab } from '@/stores/workspaceStore';

const steuerung = {
  theme: 'black',
  onToggleTheme: () => {},
  onLogout: async () => {},
};

async function zeige(tab: WorkspaceTab, adresse: string) {
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path={adresse} element={<FeatureTabHost tab={tab} themeControls={steuerung} />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByTestId('store-bereich')).toBeInTheDocument());
  return screen.getByTestId('store-bereich').textContent;
}

test('der Modelle-Tab rendert das Modell-Raster, nicht die Bruecke', async () => {
  const tab = { id: 'modelle', type: 'modelle', title: 'Modelle' } as WorkspaceTab;
  await expect(zeige(tab, '/workspace/modelle')).resolves.toBe('models');
});

test('der Erweiterungen-Tab rendert das Erweiterungs-Raster', async () => {
  const tab = {
    id: 'erweiterungen',
    type: 'erweiterungen',
    title: 'Erweiterungen',
  } as WorkspaceTab;
  await expect(zeige(tab, '/workspace/erweiterungen')).resolves.toBe('extensions');
});
