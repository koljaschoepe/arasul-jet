/**
 * Der Modelle-Tab durch den echten Weg (Plan 023 B7, in Phase D5 vereinfacht).
 *
 * Beim Aufteilen des einen „Extensions"-Tabs in zwei ist hier einmal ein
 * Fehler entstanden, den die anderen Tests nicht sehen konnten: `routeFor`
 * bekam den Tab-Typ als Schlüssel, `SELF_KEYS` hielt aber den ROUTEN-Namen.
 * Damit fiel die Route auf die Brücke zurück und der Tab blieb dauerhaft leer.
 *
 * Mit D5 gibt es diese Falle nicht mehr: der Modelle-Tab hat keine innere
 * Adresse und keinen eigenen Router, er rendert direkt. Der Test bleibt und
 * geht weiter durch `FeatureTabHost`, also durch dieselbe Kette wie die
 * Anwendung — genau daran wäre der alte Fehler aufgefallen.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/features/modelle/ModelleAnsicht', () => ({
  default: () => <div data-testid="modelle-bereich">Kurzliste</div>,
}));

import { FeatureTabHost } from '../TabContent';
import type { WorkspaceTab } from '@/stores/workspaceStore';

const steuerung = {
  onLogout: async () => {},
};

test('der Modelle-Tab rendert die Kurzliste, nicht die Bruecke', async () => {
  const tab = { id: 'modelle', type: 'modelle', title: 'Modelle' } as WorkspaceTab;
  render(
    <MemoryRouter initialEntries={['/workspace/modelle']}>
      <Routes>
        <Route
          path="/workspace/modelle"
          element={<FeatureTabHost tab={tab} handgriffe={steuerung} />}
        />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByTestId('modelle-bereich')).toBeInTheDocument());
});
