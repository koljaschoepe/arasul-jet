/**
 * Die Verwaltung (M5): eine eigene schmale Leiste der Bereiche links, der
 * gewählte Bereich daneben, ohne zweite Reiterstufe. Der Bereich gehört zur
 * Ansicht im Workspace-Store (und damit zur Adresse); bis M5 stand die Leiste
 * in der Sidebar der Shell (`SettingsPanel`) und der Bereich in einem eigenen
 * Store.
 *
 * Die Blätter (jedes holt seine eigenen Daten) sind durch Stummel ersetzt, die
 * Verwaltung und der Bereich System bleiben echt.
 *
 * Seit dem 04.10.2026 sind es die Bereiche aus `frontend.md`: Personen, Apps,
 * Firmenordner, Modelle, System, Daten, Gerät. Allgemein, KI, Sicherheit,
 * Lizenz und Fernzugriff gibt es nicht mehr; ihre Adressen führen dorthin, wo
 * die Funktion jetzt steht.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

vi.mock('../DatenSettings', () => ({ DatenSettings: stub('daten-settings', 'Daten') }));
vi.mock('../PersonenSettings', () => ({ PersonenSettings: stub('personen-settings', 'Personen') }));
vi.mock('../GeraetSettings', () => ({
  GeraetSettings: ({ abschnitt }: { abschnitt?: string }) =>
    React.createElement('div', { 'data-testid': 'geraet-settings' }, `Gerät ${abschnitt ?? ''}`),
}));
// Leaves inside the (real) SystemSettings wrapper.
vi.mock('../../system/ServicesSettings', () => ({
  ServicesSettings: stub('services-settings', 'Dienste'),
}));
vi.mock('../../system/SelfHealingEvents', () => ({
  default: stub('selfhealing-events', 'Selbstheilung'),
}));

function zeige(ansicht: Partial<Ansicht> = {}) {
  useWorkspaceStore.setState({ ansicht: { type: 'verwaltung', ...ansicht } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Settings modelle={<div data-testid="modelle-slot">Modelle</div>} />
    </QueryClientProvider>
  );
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

    test('genau die Bereiche aus dem Zielbild, in dieser Reihenfolge', () => {
      zeige();
      const namen = Array.from(
        screen.getByTestId('verwaltung-bereiche').querySelectorAll('[data-testid^="verwaltung-"]')
      ).map(e => e.textContent?.trim());
      expect(namen).toEqual([
        'Personen',
        'Apps',
        'Läufe',
        'Firmenordner',
        'Modelle',
        'System',
        'Daten',
        'Gerät',
      ]);
    });

    test('ohne Bereich stehen die Personen da', () => {
      zeige();
      expect(screen.getByTestId('personen-settings')).toBeInTheDocument();
      expect(screen.getByTestId('verwaltung-benutzer')).toHaveAttribute('aria-current', 'true');
    });

    test('ein unbekannter Bereich fällt auf Personen', () => {
      zeige({ bereich: 'gibt-es-nicht' });
      expect(screen.getByTestId('personen-settings')).toBeInTheDocument();
    });

    test('ein Klick wählt den Bereich in der Ansicht und zeigt ihn', async () => {
      const user = userEvent.setup();
      zeige();
      await user.click(screen.getByTestId('verwaltung-geraet'));
      expect(useWorkspaceStore.getState().ansicht).toEqual({
        type: 'verwaltung',
        bereich: 'geraet',
      });
      expect(screen.getByTestId('geraet-settings')).toBeInTheDocument();
      expect(screen.getByTestId('verwaltung-geraet')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByTestId('verwaltung-benutzer')).not.toHaveAttribute('aria-current');
    });

    test.each([
      ['general', 'unternehmen'],
      ['lizenz', 'lizenz'],
      ['remote-access', 'fernzugriff'],
      ['security', 'fernzugriff'],
    ])('der alte Bereich %s führt ins Gerät zum Abschnitt %s', (bereich, abschnitt) => {
      zeige({ bereich });
      expect(screen.getByTestId('geraet-settings')).toHaveTextContent(`Gerät ${abschnitt}`);
      expect(screen.getByTestId('verwaltung-geraet')).toHaveAttribute('aria-current', 'true');
    });

    test('die Aktualisierung aus System führt ins Gerät', () => {
      zeige({ bereich: 'system', abschnitt: 'updates' });
      expect(screen.getByTestId('geraet-settings')).toHaveTextContent('Gerät aktualisierung');
    });

    test('den Bereich KI gibt es nicht mehr, er führt zu den Modellen', () => {
      zeige({ bereich: 'ki' });
      expect(screen.queryByTestId('verwaltung-ki')).not.toBeInTheDocument();
      expect(screen.getByTestId('modelle-slot')).toBeInTheDocument();
    });

    test('der Bereich Modelle zeigt, was die Shell hereinreicht', () => {
      zeige({ bereich: 'modelle' });
      expect(screen.getByTestId('modelle-slot')).toBeInTheDocument();
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
    test('ein Satz, drei Zahlen, Dienste und Selbstheilung zugeklappt', () => {
      zeige({ bereich: 'system' });
      expect(screen.getByTestId('system-satz')).toBeInTheDocument();
      const zahlen = screen.getByTestId('system-zahlen');
      for (const name of ['Prozessor', 'Speicher', 'Platte']) {
        expect(zahlen).toHaveTextContent(name);
      }
      for (const name of ['Dienste', 'Selbstheilung']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      // Auslastung und Aktualisierungen gibt es hier nicht mehr.
      expect(screen.queryByRole('button', { name: 'Auslastung' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aktualisierungen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      // Nur was offen ist, ist gemountet.
      expect(screen.queryByTestId('services-settings')).not.toBeInTheDocument();
      expect(screen.queryByTestId('selfhealing-events')).not.toBeInTheDocument();
    });

    test('ein Unterbereich klappt auf, ohne den offenen zu schließen', async () => {
      const user = userEvent.setup();
      zeige({ bereich: 'system' });
      await user.click(screen.getByRole('button', { name: 'Dienste' }));
      await user.click(screen.getByRole('button', { name: 'Selbstheilung' }));
      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      expect(screen.getByTestId('services-settings')).toBeInTheDocument();
    });

    test('der Abschnitt aus der Adresse kommt aufgeklappt an', () => {
      zeige({ bereich: 'system', abschnitt: 'selfhealing' });
      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      expect(screen.queryByTestId('services-settings')).not.toBeInTheDocument();
    });
  });
});
