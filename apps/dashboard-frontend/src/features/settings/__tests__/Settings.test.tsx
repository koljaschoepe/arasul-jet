/**
 * Die Verwaltung (M5): eine eigene schmale Leiste der Bereiche links, der
 * gewählte Bereich daneben, ohne zweite Reiterstufe. Der Bereich gehört zur
 * Ansicht im Workspace-Store (und damit zur Adresse); bis M5 stand die Leiste
 * in der Sidebar der Shell (`SettingsPanel`) und der Bereich in einem eigenen
 * Store.
 *
 * Die Blätter (jedes holt seine eigenen Daten) sind durch Stummel ersetzt, die
 * Verwaltung und der Bereich System bleiben echt.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../Settings';
import { SETTINGS_SECTIONS } from '../sections';
import { useWorkspaceStore, type Ansicht } from '@/stores/workspaceStore';

let schmal = false;
vi.mock('@marken', async importOriginal => ({
  ...(await importOriginal<typeof import('@marken')>()),
  useSchmalesFenster: () => schmal,
}));

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Leaf component stubs ----
// Each stub renders a testid so we can assert which section is mounted without
// pulling in the real component's data fetching. The System leaves stay stubbed
// so SystemSettings still renders its *own* sub-navigation (kept real).

function stub(testId: string, label: string) {
  const Stub = () => React.createElement('div', { 'data-testid': testId }, label);
  Stub.displayName = `Stub(${testId})`;
  return Stub;
}

vi.mock('../GeneralSettings', () => ({ GeneralSettings: stub('general-settings', 'General') }));
vi.mock('../SecuritySettings', () => ({ SecuritySettings: stub('security-settings', 'Security') }));
vi.mock('../DatenSettings', () => ({ DatenSettings: stub('daten-settings', 'Daten') }));
vi.mock('../RemoteAccessSettings', () => ({
  RemoteAccessSettings: stub('remote-access-settings', 'Remote Access'),
}));
vi.mock('../SprachmodellSettings', () => ({
  SprachmodellSettings: stub('sprachmodell-settings', 'Modell'),
}));
// Leaves inside the (real) SystemSettings wrapper.
vi.mock('../../system/SystemStatus', () => ({ SystemStatus: stub('system-status', 'Status') }));
vi.mock('../../system/ServicesSettings', () => ({
  ServicesSettings: stub('services-settings', 'Dienste'),
}));
vi.mock('../../system/UpdatePage', () => ({ default: stub('update-page', 'Aktualisierungen') }));
vi.mock('../../system/SelfHealingEvents', () => ({
  default: stub('selfhealing-events', 'Selbstheilung'),
}));

function zeige(ansicht: Partial<Ansicht> = {}) {
  useWorkspaceStore.setState({ ansicht: { type: 'verwaltung', ...ansicht } });
  return render(<Settings modelle={<div data-testid="modelle-slot">Modelle</div>} />);
}

describe('Verwaltung', () => {
  beforeEach(() => {
    schmal = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Leiste der Bereiche', () => {
    test('kein Kopf „Einstellungen" mit Logo, oben steht gleich der Bereich', () => {
      zeige();
      expect(screen.queryByText('Einstellungen')).toBeNull();
      expect(screen.queryByLabelText('Arasul')).toBeNull();
    });

    test('die eigene Leiste nennt jeden Bereich, Modelle eingeschlossen', () => {
      zeige();
      const leiste = screen.getByTestId('verwaltung-bereiche');
      for (const section of SETTINGS_SECTIONS) {
        expect(screen.getByTestId(`verwaltung-${section.id}`)).toBeInTheDocument();
      }
      expect(leiste).toHaveTextContent('Modelle');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    test('ohne Bereich steht Allgemein da', () => {
      zeige();
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
      expect(screen.getByTestId('verwaltung-general')).toHaveAttribute('aria-current', 'true');
    });

    test('ein unbekannter Bereich fällt auf Allgemein', () => {
      zeige({ bereich: 'gibt-es-nicht' });
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });

    test('ein Klick wählt den Bereich in der Ansicht und zeigt ihn', async () => {
      const user = userEvent.setup();
      zeige();
      await user.click(screen.getByTestId('verwaltung-security'));
      expect(useWorkspaceStore.getState().ansicht).toEqual({
        type: 'verwaltung',
        bereich: 'security',
      });
      expect(screen.getByTestId('security-settings')).toBeInTheDocument();
      expect(screen.getByTestId('verwaltung-security')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByTestId('verwaltung-general')).not.toHaveAttribute('aria-current');
    });

    test('der Bereich Modelle zeigt, was die Shell hereinreicht', () => {
      zeige({ bereich: 'modelle' });
      expect(screen.getByTestId('modelle-slot')).toBeInTheDocument();
    });

    test('der Bereich KI zeigt die Standardwerte des Sprachmodells', () => {
      zeige({ bereich: 'ki' });
      expect(screen.getByTestId('sprachmodell-settings')).toBeInTheDocument();
    });

    test('unter 900 px wird die Leiste zur Auswahl über dem Bereich', () => {
      schmal = true;
      zeige({ bereich: 'daten' });
      expect(screen.queryByTestId('verwaltung-bereiche')).not.toBeInTheDocument();
      expect(screen.getByTestId('verwaltung-bereich-wahl')).toHaveTextContent('Daten');
      expect(screen.getByTestId('daten-settings')).toBeInTheDocument();
    });
  });

  describe('Bereich Daten', () => {
    test('steht in der Leiste, Datenschutz gibt es dort nicht mehr', () => {
      zeige({ bereich: 'daten' });
      expect(screen.getByTestId('verwaltung-daten')).toBeInTheDocument();
      expect(screen.queryByTestId('verwaltung-privacy')).not.toBeInTheDocument();
      expect(screen.getByTestId('daten-settings')).toBeInTheDocument();
    });

    test.each([
      [{ bereich: 'privacy' }],
      [{ bereich: 'system', abschnitt: 'sicherung' }],
      [{ bereich: 'system', abschnitt: 'werksreset' }],
    ])('die alte Adresse %j landet im Bereich Daten', ansicht => {
      zeige(ansicht);
      expect(screen.getByTestId('daten-settings')).toBeInTheDocument();
    });

    test('System hat keinen Unterbereich Sicherung oder Werksreset mehr', () => {
      zeige({ bereich: 'system' });
      expect(screen.queryByRole('button', { name: 'Sicherung' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Werksreset' })).not.toBeInTheDocument();
    });
  });

  describe('Bereich System', () => {
    test('die Unterbereiche stehen untereinander, die Auslastung offen', () => {
      zeige({ bereich: 'system' });
      for (const name of ['Auslastung', 'Dienste', 'Aktualisierungen', 'Selbstheilung']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('system-status')).toBeInTheDocument();
      // Nur was offen ist, ist gemountet.
      expect(screen.queryByTestId('services-settings')).not.toBeInTheDocument();
    });

    test('ein Unterbereich klappt auf, ohne den offenen zu schließen', async () => {
      const user = userEvent.setup();
      zeige({ bereich: 'system' });
      await user.click(screen.getByRole('button', { name: 'Selbstheilung' }));
      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      expect(screen.getByTestId('system-status')).toBeInTheDocument();
    });

    test('der Abschnitt aus der Adresse kommt aufgeklappt an', () => {
      zeige({ bereich: 'system', abschnitt: 'selfhealing' });
      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      expect(screen.queryByTestId('system-status')).not.toBeInTheDocument();
    });
  });
});
