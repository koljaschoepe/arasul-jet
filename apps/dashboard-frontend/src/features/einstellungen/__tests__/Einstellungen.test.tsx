/**
 * Die persönlichen Einstellungen (M5): für alle dieselben vier Abschnitte, und
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

let mitTheme: 'light' | 'dark' | 'system' = 'light';
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
    logout: vi.fn(() => Promise.resolve()),
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

const RECHNER = [
  {
    id: 4,
    name: 'Laptop Büro',
    praefix: 'ara_ab12',
    angelegt_am: '2026-10-01T08:00:00Z',
    zuletzt_benutzt_am: null,
  },
];

function zeige() {
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

  it.each(['admin', 'mitarbeiter'] as const)('%s sieht dieselben vier Abschnitte', async r => {
    rolle = r;
    zeige();
    const ueberschriften = await screen.findAllByRole('heading', { level: 2 });
    expect(ueberschriften.map(h => h.textContent)).toEqual([
      'Profil',
      'Passwort',
      'Angemeldete Rechner',
      'Erscheinungsbild',
    ]);
    for (const label of ['Vorname', 'Nachname', 'Funktion', 'Kürzel']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('profil-bild-waehlen')).toBeInTheDocument();
  });

  it('hat den Seitenkopf „Einstellungen" wie die übrigen Seiten, aber kein Logo', async () => {
    zeige();
    await screen.findByText('Angemeldete Rechner');
    expect(screen.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Arasul')).not.toBeInTheDocument();
  });

  it('nennt „Meine Ausweise" nicht mehr und erzeugt im Browser keinen Ausweis', async () => {
    zeige();
    await screen.findByTestId('rechner-4');
    expect(screen.queryByText(/Ausweis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ausstellen|Erzeugen/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Name des Rechners/ })).not.toBeInTheDocument();
  });

  it('„abmelden" widerruft den Ausweis des Rechners', async () => {
    const user = userEvent.setup();
    vi.mocked(mockApi.del).mockResolvedValue({});
    zeige();
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
      zeige();
      const anleitung = await screen.findByTestId('rechner-verbinden');
      // Sie steht unter „Angemeldete Rechner", nicht als eigener Abschnitt.
      expect(screen.getByRole('heading', { level: 2, name: 'Angemeldete Rechner' })).toBeTruthy();
      const befehl = within(anleitung).getByTestId('rechner-verbinden-befehl');
      expect(befehl.textContent).toBe(
        `node arasul.mjs login ${window.location.origin} --user probe`
      );
      expect(within(anleitung).getAllByTestId(/befehl/)).toHaveLength(1);
      await user.click(within(anleitung).getByTestId('rechner-verbinden-kopieren'));
      expect(schreiben).toHaveBeenCalledWith(befehl.textContent);
    }
  );

  it('Erscheinungsbild: System, Hell, Dunkel, Hell ist die Vorgabe', async () => {
    zeige();
    await screen.findByText('Erscheinungsbild');
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
    zeige();
    await user.click(await screen.findByRole('radio', { name: new RegExp(name) }));
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/darstellung', { theme: wert });
    });
    expect(benutzerAktualisieren).toHaveBeenCalledWith({ theme: wert });
  });

  it('wer mit „system" hereinkommt, sieht „System" angehakt', async () => {
    mitTheme = 'system';
    zeige();
    expect(await screen.findByRole('radio', { name: /System/ })).toBeChecked();
  });
});
