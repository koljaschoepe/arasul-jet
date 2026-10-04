/**
 * Der Bereich Gerät (M5): Unternehmen als Text mit Logo, die Lizenz mit drei
 * Zahlen und Einspielen im Dialog, der Fernzugriff als Schalter mit Adresse.
 * Gemessen wird vor allem, was NICHT geschieht: kein Formular ohne
 * „Bearbeiten", kein Einspielen ohne Dialog, kein Ausschalten ohne Rückfrage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Unternehmen } from '../Unternehmen';
import { Lizenz } from '../Lizenz';
import { Fernzugriff } from '../Fernzugriff';
import { lageSatz } from '@/features/system/SystemSettings';

const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => api }));

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const bestaetigt = { wert: false };
const confirm = vi.fn(async () => bestaetigt.wert);
vi.mock('@/hooks/useConfirm', () => ({ default: () => ({ confirm, ConfirmDialog: null }) }));

function huelle({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LIZENZ = {
  valid: true,
  tier: 'professional',
  customer: 'Muster GmbH',
  expiresAt: '2027-03-31T00:00:00.000Z',
  hardwareFingerprint: '22f2ffa61aa4af5de84f852af9630187',
  nutzung: {
    stufe: 'professional',
    konten: { belegt: 6, grenze: 10 },
    apps: { belegt: 3, grenze: 5 },
  },
};

const VERBUNDEN = {
  installed: true,
  running: true,
  connected: true,
  ip: '100.121.244.80',
  hostname: 'arasul',
  dnsName: 'arasul.tail746d9b.ts.net',
  tailnet: 'tail746d9b.ts.net',
  version: '1.102.2',
  peers: [],
};

function antworte(werte: Record<string, unknown>) {
  api.get.mockImplementation(async (pfad: string) => werte[pfad] ?? {});
}

beforeEach(() => {
  vi.clearAllMocks();
  bestaetigt.wert = false;
});

describe('Unternehmen', () => {
  it('zeigt Name und Logo als Text; ohne Namen den Produktnamen', async () => {
    antworte({
      '/auth/needs-setup': { needsSetup: false, firmenname: null, logo: '2026-10-04T20:00:00Z' },
    });
    render(<Unternehmen />, { wrapper: huelle });
    expect(await screen.findByTestId('unternehmen-name')).toHaveTextContent(/Kein Name hinterlegt/);
    expect(screen.getByTestId('unternehmen-logo')).toHaveAttribute(
      'src',
      expect.stringContaining('/darstellung/logo?stand=')
    );
    expect(screen.queryByTestId('unternehmen-formular')).not.toBeInTheDocument();
  });

  it('nimmt ein Logo an, prüft Art und Größe, und entfernt es auf Wunsch', async () => {
    const user = userEvent.setup({ applyAccept: false });
    antworte({ '/auth/needs-setup': { needsSetup: false, firmenname: 'Muster GmbH', logo: null } });
    render(<Unternehmen />, { wrapper: huelle });
    await user.click(await screen.findByTestId('unternehmen-bearbeiten'));

    // Ein SVG lehnt die Seite ab, bevor etwas ans Gerät geht.
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await user.upload(screen.getByTestId('unternehmen-logo-datei'), svg);
    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG-, JPEG- oder WebP/);

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByTestId('unternehmen-logo-datei'), png);
    expect(await screen.findByTestId('unternehmen-logo-vorschau')).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png;base64,/)
    );

    api.put.mockResolvedValue({});
    await user.click(screen.getByTestId('unternehmen-speichern'));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/settings/logo', {
        bild: expect.stringMatching(/^data:image\/png;base64,/),
      })
    );
    // Der Name blieb, also kein Weg dorthin.
    expect(api.put).not.toHaveBeenCalledWith('/settings/firmenname', expect.anything());
  });

  it('Entfernen löscht das Logo am Gerät', async () => {
    const user = userEvent.setup();
    antworte({
      '/auth/needs-setup': { needsSetup: false, firmenname: 'Muster GmbH', logo: '2026-10-04' },
    });
    render(<Unternehmen />, { wrapper: huelle });
    await user.click(await screen.findByTestId('unternehmen-bearbeiten'));
    await user.click(screen.getByTestId('unternehmen-logo-entfernen'));
    api.del.mockResolvedValue({});
    await user.click(screen.getByTestId('unternehmen-speichern'));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/settings/logo'));
  });
});

describe('Lizenz', () => {
  it('drei Zahlen; Einspielen erst im Dialog; Fingerabdruck aufgeklappt', async () => {
    const user = userEvent.setup();
    antworte({ '/license/info': LIZENZ });
    render(<Lizenz />, { wrapper: huelle });
    expect(await screen.findByTestId('lizenz-stufe')).toHaveTextContent('Professional');
    expect(screen.getByTestId('lizenz-konten')).toHaveTextContent('6 von 10');
    expect(screen.getByTestId('lizenz-bis')).toHaveTextContent('31.3.2027');

    expect(screen.queryByTestId('lizenz-feld')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lizenz-fingerabdruck')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('lizenz-mehr-knopf'));
    expect(screen.getByTestId('lizenz-fingerabdruck')).toHaveTextContent(
      LIZENZ.hardwareFingerprint
    );
    expect(screen.getByTestId('lizenz-apps')).toHaveTextContent('3 von 5');

    await user.click(screen.getByTestId('lizenz-einspielen-oeffnen'));
    expect(screen.getByTestId('lizenz-feld')).toBeInTheDocument();
    expect(screen.getByTestId('lizenz-einspielen')).toBeDisabled();
    // Abbrechen spielt nichts ein.
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('zeigt eine abgelehnte Lizenz im Dialog, nicht als Hinweis', async () => {
    const user = userEvent.setup();
    antworte({ '/license/info': LIZENZ });
    api.post.mockRejectedValue({ message: 'Die Lizenz gehört zu einem anderen Gerät.' });
    render(<Lizenz />, { wrapper: huelle });
    await user.click(await screen.findByTestId('lizenz-einspielen-oeffnen'));
    fireEvent.change(screen.getByTestId('lizenz-feld'), { target: { value: 'x'.repeat(40) } });
    await user.click(screen.getByTestId('lizenz-einspielen'));
    expect(await screen.findByTestId('lizenz-einspielen-fehler')).toHaveTextContent(
      'anderen Gerät'
    );
  });
});

describe('Fernzugriff', () => {
  it('ein Schalter mit Adresse; Technik erst aufgeklappt', async () => {
    const user = userEvent.setup();
    antworte({ '/tailscale/status': VERBUNDEN, '/system/network': { mdns: 'arasul.local' } });
    render(<Fernzugriff />, { wrapper: huelle });
    expect(await screen.findByTestId('fernzugriff-adresse')).toHaveTextContent(
      'https://arasul.tail746d9b.ts.net'
    );
    expect(await screen.findByTestId('fernzugriff-firmennetz')).toHaveTextContent(
      'https://arasul.local'
    );
    expect(screen.getByTestId('fernzugriff-schalter')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('100.121.244.80')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('fernzugriff-technik-knopf'));
    expect(screen.getByTestId('fernzugriff-technik')).toHaveTextContent('100.121.244.80');
  });

  it('Ausschalten fragt nach; ohne Ja geschieht nichts', async () => {
    const user = userEvent.setup();
    antworte({ '/tailscale/status': VERBUNDEN });
    render(<Fernzugriff />, { wrapper: huelle });
    await screen.findByTestId('fernzugriff-adresse');
    await user.click(screen.getByTestId('fernzugriff-schalter'));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/ausschalten/) })
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('Einschalten öffnet den Dialog mit dem Schlüssel, ohne etwas zu schicken', async () => {
    const user = userEvent.setup();
    antworte({ '/tailscale/status': { ...VERBUNDEN, connected: false, dnsName: null } });
    render(<Fernzugriff />, { wrapper: huelle });
    expect(await screen.findByTestId('fernzugriff-aus')).toHaveTextContent(/Aus/);
    await user.click(screen.getByTestId('fernzugriff-schalter'));
    expect(screen.getByTestId('fernzugriff-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('fernzugriff-verbinden')).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('System: der eine Satz', () => {
  it('„Alles läuft." oder das, was nicht stimmt', () => {
    expect(lageSatz({ status: 'OK', warnings: [], criticals: [] }, false)).toBe('Alles läuft.');
    expect(
      lageSatz(
        {
          status: 'CRITICAL',
          warnings: ['Der Speicher wird knapp (85 %)'],
          criticals: ['Ein Dienst ist ausgefallen: Datenbank'],
        },
        false
      )
    ).toBe('Ein Dienst ist ausgefallen: Datenbank. Der Speicher wird knapp (85 %).');
    expect(lageSatz(undefined, true)).toMatch(/nicht abfragen/);
  });
});
