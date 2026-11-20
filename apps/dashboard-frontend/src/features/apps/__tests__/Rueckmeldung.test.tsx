/**
 * Die Rückmeldung im Rahmen (J42, M7): das Icon steht über jeder App, ohne dass
 * die App etwas tut; ein Klick nimmt das Foto auf und öffnet das Formular;
 * Text ist Pflicht, das Foto abwählbar; App, Stand und Seite hängt der Rahmen
 * an; danach sieht der Melder nur die Bestätigung.
 *
 * Das Foto selbst ist hier eine Attrappe: jsdom zeichnet nichts. Dass es im
 * Browser entsteht, belegt die Probe am Orin (Chromium und WebKit, Rechner und
 * 390 px), nachzulesen in `docs/features/RUECKMELDUNG.md`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppRahmen } from '../AppRahmen';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 2, username: 'mia', role: 'mitarbeiter', theme: 'light' },
    isAuthenticated: true,
    benutzerAktualisieren: vi.fn(),
  }),
}));

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let foto: string | null = PIXEL;
const fotoVomRahmen = vi.fn(async (_rahmen: HTMLIFrameElement | null) => foto);
vi.mock('../rueckmeldung/bildschirmfoto', () => ({
  fotoVomRahmen: (r: HTMLIFrameElement | null) => fotoVomRahmen(r),
  bildMitMarkierung: async (bild: string) => bild,
}));

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MEINE = {
  data: [
    {
      id: 'belege',
      name: 'Belege',
      beschreibung: null,
      live: { version: '1.0.0', pfad: '/apps/belege/' },
      test: { version: '1.1.0', pfad: '/apps/belege/test/' },
    },
  ],
};

describe('Rückmeldung im Rahmen', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue(MEINE);
    apiMock.post.mockResolvedValue({ data: { id: 7, erstellt_am: 'jetzt' } });
    foto = PIXEL;
    fotoVomRahmen.mockClear();
  });

  it('das Icon steht über der App, im Rahmen und nicht in ihr', async () => {
    render(<AppRahmen appId="belege" stand="live" />, { wrapper: huelle() });
    const rahmen = await screen.findByTestId('app-rahmen-belege');
    const knopf = screen.getByTestId('rueckmeldung-knopf');
    expect(knopf).toHaveAccessibleName('Rückmeldung zu dieser Seite');
    // Geschwister des iframes in derselben Hülle, nicht im Dokument der App.
    expect(knopf.parentElement).toBe(rahmen.parentElement);
    expect(knopf.className).toMatch(/absolute/);
    expect(knopf.className).toMatch(/top-2/);
    expect(knopf.className).toMatch(/right-2/);
  });

  it('Text ist Pflicht; abgesendet wird mit App, Stand, Seite und Foto, danach nur die Bestätigung', async () => {
    const nutzer = userEvent.setup();
    render(<AppRahmen appId="belege" stand="live" />, { wrapper: huelle() });
    await nutzer.click(await screen.findByTestId('rueckmeldung-knopf'));

    expect(fotoVomRahmen).toHaveBeenCalledWith(screen.getByTestId('app-rahmen-belege'));
    const absenden = await screen.findByTestId('rueckmeldung-absenden');
    expect(absenden).toBeDisabled();
    expect(screen.getByTestId('rueckmeldung-markierung')).toBeInTheDocument();
    expect(screen.getByTestId('rueckmeldung-mit-foto')).toBeChecked();

    await nutzer.type(screen.getByTestId('rueckmeldung-text'), '  Filter nach Monat fehlt  ');
    expect(absenden).toBeEnabled();
    await nutzer.click(absenden);

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith('/rueckmeldungen', {
      app_id: 'belege',
      stand: 'live',
      seite: '/apps/belege/',
      text: 'Filter nach Monat fehlt',
      bild: PIXEL,
      markierung: null,
    });
    expect(await screen.findByTestId('rueckmeldung-bestaetigung')).toHaveTextContent(
      'Ihre Rückmeldung ist angekommen.'
    );
    // Keine Liste, kein Weg zurück zur eigenen Meldung.
    expect(screen.queryByTestId('rueckmeldung-text')).toBeNull();
    expect(apiMock.get).not.toHaveBeenCalledWith('/rueckmeldungen', expect.anything());
  });

  it('das Foto ist abwählbar: dann geht kein Bild mit', async () => {
    const nutzer = userEvent.setup();
    render(<AppRahmen appId="belege" stand="test" />, { wrapper: huelle() });
    await nutzer.click(await screen.findByTestId('rueckmeldung-knopf'));
    await nutzer.click(await screen.findByTestId('rueckmeldung-mit-foto'));
    expect(screen.queryByTestId('rueckmeldung-markierung')).toBeNull();
    await nutzer.type(screen.getByTestId('rueckmeldung-text'), 'Knopf zu klein');
    await nutzer.click(screen.getByTestId('rueckmeldung-absenden'));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post.mock.calls[0]?.[1]).toMatchObject({
      stand: 'test',
      seite: '/apps/belege/test/',
      bild: null,
      markierung: null,
    });
  });

  it('ohne Foto sagt das Formular es und sendet nur den Text', async () => {
    foto = null;
    const nutzer = userEvent.setup();
    render(<AppRahmen appId="belege" stand="live" />, { wrapper: huelle() });
    await nutzer.click(await screen.findByTestId('rueckmeldung-knopf'));
    expect(await screen.findByTestId('rueckmeldung-ohne-foto')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('rueckmeldung-text'), { target: { value: 'Nur Text' } });
    await nutzer.click(screen.getByTestId('rueckmeldung-absenden'));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post.mock.calls[0]?.[1]).toMatchObject({ text: 'Nur Text', bild: null });
  });

  it('eine App, die dieser Person nicht freigegeben ist, zeigt kein Icon', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<AppRahmen appId="belege" stand="live" />, { wrapper: huelle() });
    await screen.findByText('Diese App ist Ihnen nicht freigegeben');
    expect(screen.queryByTestId('rueckmeldung-knopf')).toBeNull();
  });
});
