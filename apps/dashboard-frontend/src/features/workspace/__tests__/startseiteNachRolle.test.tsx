/**
 * Die Startseite nach Rolle. J36 (02.10.2026) hatte dem Mitarbeiter die
 * Freigabenliste genommen; seit M5 (04.10.2026) sieht JEDER „Für Sie" — nur
 * die Freigaben, die bei ihm liegen, das filtert das Backend. Durch
 * `AnsichtWeiche`, also dieselbe Kette wie die Anwendung.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AnsichtWeiche } from '../AnsichtInhalt';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
import { angemeldet } from '@/__tests__/helpers/authMock';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

const FREIGABE = {
  id: 7,
  run_id: 1,
  app_id: 'urlaub',
  app_name: 'Urlaubsantrag',
  stand: 'live',
  flow_name: 'antrag',
  titel: 'Urlaub vom 5. bis 9. Oktober',
  zusammenhang: null,
  frist: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
  angefragt_am: new Date().toISOString(),
};

function zeigeStartseite() {
  get.mockImplementation(async (pfad: string) => {
    if (pfad === '/apps/meine') {
      return {
        data: [
          {
            id: 'urlaub',
            name: 'Urlaubsantrag',
            beschreibung: null,
            live: { version: '1.0.0', pfad: '/apps/urlaub/' },
            test: null,
          },
        ],
      };
    }
    if (pfad === '/freigabe-anfragen') return { data: [FREIGABE] };
    if (pfad === '/freigabe-anfragen/eingereicht') return { data: [] };
    return {};
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnsichtWeiche ansicht={{ type: 'dashboard' }} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Startseite nach Rolle', () => {
  it('zeigt dem Mitarbeiter „Für Sie" und die Zahl an der App', async () => {
    angemeldet({ role: 'mitarbeiter', username: 'mia' });
    zeigeStartseite();
    expect(await screen.findByTestId('uebersicht-app-urlaub-live-wartend')).toHaveTextContent(
      /^1 Freigabe offen$/
    );
    expect(await screen.findByTestId('startband-freigaben')).toHaveTextContent(
      'Eine Freigabe wartet auf Sie'
    );
    expect(await screen.findByTestId('offene-freigaben')).toHaveTextContent('Für Sie');
    expect(await screen.findByText('Urlaub vom 5. bis 9. Oktober')).toBeInTheDocument();
  });

  it('zeigt dem Administrator weiter die Liste', async () => {
    angemeldet({ role: 'admin' });
    zeigeStartseite();
    expect(await screen.findByTestId('offene-freigaben')).toBeInTheDocument();
    expect(await screen.findByText('Urlaub vom 5. bis 9. Oktober')).toBeInTheDocument();
  });
});
