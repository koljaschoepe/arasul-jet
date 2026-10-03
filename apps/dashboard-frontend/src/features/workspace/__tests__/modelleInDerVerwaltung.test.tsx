/**
 * Die Modelle als Bereich der Verwaltung (M5), durch die echte Kette:
 * `AnsichtWeiche` reicht `ModelleAnsicht` als Slot in die Verwaltung, die
 * Verwaltung zeigt ihn unter dem Bereich `modelle`. Bis M5 waren die Modelle
 * eine eigene Ansicht der Aktivitätsleiste mit eigenem Tab.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { AnsichtWeiche } from '../AnsichtInhalt';

vi.mock('@/features/modelle/ModelleAnsicht', () => ({
  default: () => <div data-testid="modelle-bereich">Kurzliste</div>,
}));

test('der Bereich Modelle zeigt die Kurzliste, links die Bereiche', async () => {
  const ansicht = { type: 'verwaltung', bereich: 'modelle' } as const;
  useWorkspaceStore.setState({ ansicht });
  render(
    <MemoryRouter>
      <AnsichtWeiche ansicht={ansicht} />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByTestId('modelle-bereich')).toBeInTheDocument());
  expect(screen.getByTestId('verwaltung-modelle')).toHaveAttribute('aria-current', 'true');
});
