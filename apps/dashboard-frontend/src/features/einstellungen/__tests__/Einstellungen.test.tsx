/**
 * Die persönlichen Einstellungen (M5): für alle dieselben vier Bereiche, je
 * Bereich eine Seite mit derselben Leiste wie die Verwaltung (07.10.2026), und
 * der Ausweis für das CLI wird hier nie erzeugt.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMockApi, createMockToast } from '../../../__tests__/helpers/renderWithProviders';

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let schmal = false;
vi.mock('@marken', async importOriginal => ({
  ...(await importOriginal<typeof import('@marken')>()),
  useSchmalesFenster: () => schmal,
}));

let mitTheme: 'light' | 'dark' | 'system' = 'light';
const abmelden = vi.fn(() => Promise.resolve());
let rolle: 'admin' | 'mitarbeiter' = 'admin';
const benutzerAktualisieren = vi.fn((teil: { theme?: 'light' | 'dark' | 'system' }) => {
  if (teil.theme) mitTheme = teil.theme;
});

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'probe',
      role: rolle,
      theme: mitTheme,
      vorname: 'Pia',
      nachname: 'Probe',
      anzeigeName: 'Pia Probe',
    },
    isAuthenticated: true,
    logout: abmelden,
    benutzerAktualisieren,
  }),
}));

vi.mock('../../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

import Einstellungen from '../Einstellungen';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const RECHNER = [
  {
    id: 4,
    name: 'Laptop Büro',
    praefix: 'ara_ab12',
    angelegt_am: '2026-10-01T08:00:00Z',
    zuletzt_benutzt_am: null,
  },
];

function zeige(bereich?: string) {
  useWorkspaceStore.setState({ ansicht: { type: 'settings', ...(bereich ? { bereich } : {}) } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Einstellungen />
    </QueryClientProvider>
  );
}

describe('Einstellungen, persönlich', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mitTheme = 'light';
    rolle = 'admin';
    schmal = false;
    vi.mocked(mockApi.get).mockImplementation((path: string) => {
      if (path === '/ausweise') return Promise.resolve({ data: RECHNER });
      if (path === '/settings/password-requirements') {
        return Promise.resolve({
          requirements: {
            minLength: 4,
            requireUppercase: false,
            requireLowercase: false,
            requireNumbers: false,
            requireSpecialChars: false,
          },
        });
      }
      return Promise.resolve({});
    });
  });

  it.each(['admin', 'mitarbeiter'] as const)(
    '%s sieht dieselbe Leiste: Titel „Einstellungen", vier Bereiche in zwei Gruppen',
    async r => {
      rolle = r;
      zeige();
      const leiste = screen.getByTestId('einstellungen-bereiche');
      expect(document.querySelector('[data-slot="sidebar-titel"]')).toHaveTextContent(
        'Einstellungen'
      );
      const namen = Array.from(leiste.querySelectorAll('[data-sidebar="menu-button"]')).map(
        e => e.textContent
      );
      expect(namen).toEqual(['Profil', 'Passwort', 'Angemeldete Rechner', 'Erscheinungsbild']);
      const gruppen = Array.from(leiste.querySelectorAll('[data-sidebar="group-label"]')).map(
        g => g.textContent
      );
      expect(gruppen).toEqual(['Konto', 'Darstellung']);
      // Am großen Bildschirm steht Abmelden in der Fußzeile, nicht hier.
      expect(screen.queryByTestId('workspace-abmelden')).not.toBeInTheDocument();
    }
  );

  it('ohne Bereich steht das Profil da, als eigene Seite', async () => {
    zeige();
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument();
    for (const label of ['Vorname', 'Nachname', 'Funktion', 'Kürzel']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('profil-bild-waehlen')).toBeInTheDocument();
    expect(screen.getByTestId('einstellungen-profil')).toHaveAttribute('aria-current', 'page');
    // Je Bereich eine Seite: die anderen stehen nicht darunter.
    expect(screen.queryByText('Erscheinungsbild', { selector: 'h1' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Aktuelles Passwort eingeben')).not.toBeInTheDocument();
  });

  it('ein Klick in der Leiste öffnet den Bereich und schreibt ihn in die Ansicht', async () => {
    const user = userEvent.setup();
    zeige();
    await user.click(screen.getByTestId('einstellungen-erscheinungsbild'));
    expect(useWorkspaceStore.getState().ansicht).toEqual({
      type: 'settings',
      bereich: 'erscheinungsbild',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Erscheinungsbild' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('einstellungen-erscheinungsbild')).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('die Seite Passwort trägt den Titel einmal', async () => {
    zeige('passwort');
    expect(await screen.findAllByRole('heading', { name: 'Passwort' })).toHaveLength(1);
    expect(screen.getByPlaceholderText('Aktuelles Passwort eingeben')).toBeInTheDocument();
  });

  it('ein unbekannter Bereich fällt auf das Profil', async () => {
    zeige('gibt-es-nicht');
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument();
  });

  it('am Handy steht „Abmelden" als letzter Eintrag der Leiste', async () => {
    schmal = true;
    const user = userEvent.setup();
    zeige();
    const leiste = screen.getByTestId('einstellungen-bereiche');
    const knoepfe = leiste.querySelectorAll('[data-sidebar="menu-button"]');
    const letzter = knoepfe[knoepfe.length - 1] as HTMLElement;
    expect(letzter).toHaveTextContent('Abmelden');
    expect(letzter).toHaveAttribute('data-testid', 'workspace-abmelden');
    await user.click(letzter);
    expect(abmelden).toHaveBeenCalledOnce();
  });

  it('nennt „Meine Ausweise" nicht mehr und erzeugt im Browser keinen Ausweis', async () => {
    zeige('rechner');
    await screen.findByTestId('rechner-4');
    expect(screen.queryByText(/Ausweis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ausstellen|Erzeugen/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Name des Rechners/ })).not.toBeInTheDocument();
  });

  it('„abmelden" widerruft den Ausweis des Rechners', async () => {
    const user = userEvent.setup();
    vi.mocked(mockApi.del).mockResolvedValue({});
    zeige('rechner');
    const zeile = await screen.findByTestId('rechner-4');
    expect(within(zeile).getByText('Laptop Büro')).toBeInTheDocument();
    await user.click(within(zeile).getByRole('button', { name: 'abmelden' }));
    await waitFor(() => expect(mockApi.del).toHaveBeenCalledWith('/ausweise/4'));
  });

  it.each(['admin', 'mitarbeiter'] as const)(
    '%s findet die Anleitung mit genau einem Befehl zum Kopieren',
    async r => {
      rolle = r;
      const user = userEvent.setup();
      // `setup` legt eine eigene Zwischenablage an; erst danach ersetzen.
      const schreiben = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: schreiben },
        configurable: true,
      });
      zeige('rechner');
      const anleitung = await screen.findByTestId('rechner-verbinden');
      // Sie steht auf der Seite „Angemeldete Rechner", nicht als eigener Bereich.
      expect(screen.getByRole('heading', { level: 1, name: 'Angemeldete Rechner' })).toBeTruthy();
      const befehl = within(anleitung).getByTestId('rechner-verbinden-befehl');
      expect(befehl.textContent).toBe(
        `node arasul.mjs login ${window.location.origin} --user probe`
      );
      expect(within(anleitung).getAllByTestId(/befehl/)).toHaveLength(1);
      await user.click(within(anleitung).getByTestId('rechner-verbinden-kopieren'));
      expect(schreiben).toHaveBeenCalledWith(befehl.textContent);
    }
  );

  it('Erscheinungsbild: System, Hell, Dunkel; wer „light" trägt, sieht Hell', async () => {
    zeige('erscheinungsbild');
    await screen.findByRole('heading', { level: 1, name: 'Erscheinungsbild' });
    const radios = screen.getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('id'))).toEqual([
      'theme-system',
      'theme-light',
      'theme-dark',
    ]);
    expect(screen.getByRole('radio', { name: /Hell/ })).toBeChecked();
  });

  it.each([
    ['System', 'system'],
    ['Dunkel', 'dark'],
  ] as const)('„%s" geht an das Gerät', async (name, wert) => {
    const user = userEvent.setup();
    vi.mocked(mockApi.put).mockResolvedValue({ data: { theme: wert } });
    zeige('erscheinungsbild');
    await user.click(await screen.findByRole('radio', { name: new RegExp(name) }));
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/darstellung', { theme: wert });
    });
    expect(benutzerAktualisieren).toHaveBeenCalledWith({ theme: wert });
  });

  it('wer mit „system" hereinkommt, sieht „System" angehakt', async () => {
    mitTheme = 'system';
    zeige('erscheinungsbild');
    expect(await screen.findByRole('radio', { name: /System/ })).toBeChecked();
  });
});
