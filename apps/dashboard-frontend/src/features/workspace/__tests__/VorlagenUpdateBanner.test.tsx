/**
 * VorlagenUpdateBanner Tests (Plan 014, Phase 6).
 *
 * Kernzusagen: (1) Banner nur bei vorliegendem Update. (2) „Ansehen" öffnet den
 * Dialog mit den Neuerungen (vorgewählt). (3) Übernehmen ruft die Mutation mit
 * der Auswahl.
 */
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VorlagenUpdateBanner } from '../VorlagenUpdateBanner';
import type { VorlagenUpdateStand } from '../useProjects';

const uebernehmenMutate = vi
  .fn()
  .mockResolvedValue({ data: { uebernommen: ['flows/neu.md'], version: 2 } });
let stand: VorlagenUpdateStand | null;

vi.mock('../useProjects', () => ({
  useActiveProject: () => ({ activeId: 'p1' }),
  useVorlagenUpdate: () => ({
    stand,
    isLoading: false,
    uebernehmen: { mutateAsync: uebernehmenMutate, isPending: false },
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  stand = {
    update: true,
    vorlage_id: 'kunden-auftraege',
    projekt_version: 1,
    neue_version: 2,
    neuerungen: [{ pfad: 'flows/neu.md' }, { pfad: '_Vorlagen/Stil.md' }],
  };
});

describe('VorlagenUpdateBanner', () => {
  it('zeigt das Banner mit der Anzahl der Neuerungen', () => {
    render(<VorlagenUpdateBanner />);
    expect(screen.getByTestId('vorlagen-update-banner')).toHaveTextContent('2 Neuerungen');
  });

  it('rendert nichts, wenn kein Update vorliegt', () => {
    stand = { ...stand!, update: false };
    render(<VorlagenUpdateBanner />);
    expect(screen.queryByTestId('vorlagen-update-banner')).not.toBeInTheDocument();
  });

  it('„Ansehen" öffnet den Dialog mit vorgewählten Neuerungen; Übernehmen ruft die Mutation', async () => {
    const user = userEvent.setup();
    render(<VorlagenUpdateBanner />);
    await user.click(screen.getByTestId('vorlagen-update-ansehen'));

    const dialog = await screen.findByTestId('vorlagen-update-dialog');
    expect(dialog).toHaveTextContent('flows/neu.md');
    expect(dialog).toHaveTextContent('_Vorlagen/Stil.md');

    // Eine Neuerung abwählen, dann übernehmen → nur die verbleibende geht mit.
    await user.click(screen.getByTestId('vorlagen-update-item-_Vorlagen/Stil.md'));
    await user.click(screen.getByTestId('vorlagen-update-uebernehmen'));

    await waitFor(() => expect(uebernehmenMutate).toHaveBeenCalledWith(['flows/neu.md']));
  });
});
