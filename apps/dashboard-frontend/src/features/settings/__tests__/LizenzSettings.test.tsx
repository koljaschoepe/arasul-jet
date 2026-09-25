/**
 * Die Seite Lizenz (Auftrag J35, 25.09.2026).
 *
 * Gemessen wird, was die Abnahme verlangt: Stufe, Konten x von y, Apps x von
 * y, der Fingerabdruck zum Kopieren und ein Feld zum Einspielen. Dazu die
 * zwei Ausgänge des Einspielens: eine Lizenz, die besteht, geht als
 * `licenseKey` an `POST /api/license/activate`; eine, die nicht besteht,
 * nennt den Grund unter dem Feld.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LizenzSettings } from '../LizenzSettings';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const COMMUNITY = {
  valid: false,
  tier: 'community',
  error: 'No license file found',
  hardwareFingerprint: '0123456789abcdef0123456789abcdef',
  nutzung: {
    stufe: 'community',
    konten: { belegt: 2, grenze: 3 },
    apps: { belegt: 3, grenze: 3 },
  },
};
const PROFESSIONAL = {
  ...COMMUNITY,
  valid: true,
  tier: 'professional',
  error: undefined,
  customer: 'Muster GmbH',
  expiresAt: '2027-09-25T00:00:00.000Z',
  nutzung: {
    stufe: 'professional',
    konten: { belegt: 5, grenze: -1 },
    apps: { belegt: 4, grenze: -1 },
  },
};

function mitAbfrage(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('LizenzSettings', () => {
  // Das Geraet steht in Berlin; der Fehler lag in der Ortszeit, also misst
  // der Test in ihr und nicht im UTC der CI.
  const tzVorher = process.env.TZ;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'Europe/Berlin';
  });
  afterEach(() => {
    process.env.TZ = tzVorher;
  });

  it('zeigt Stufe, Konten x von y, Apps x von y und den Fingerabdruck', async () => {
    apiMock.get.mockResolvedValue(COMMUNITY);
    mitAbfrage(<LizenzSettings />);
    expect(await screen.findByTestId('lizenz-stufe')).toHaveTextContent('Community');
    expect(screen.getByTestId('lizenz-konten')).toHaveTextContent('2 von 3');
    expect(screen.getByTestId('lizenz-apps')).toHaveTextContent('3 von 3');
    expect(screen.getByTestId('lizenz-fingerabdruck')).toHaveTextContent(
      '0123456789abcdef0123456789abcdef'
    );
    expect(apiMock.get).toHaveBeenCalledWith('/license/info', expect.anything());
    // Ohne Lizenzdatei ist nichts abgelehnt worden -- kein rotes Feld.
    expect(screen.queryByTestId('lizenz-abgelehnt')).toBeNull();
  });

  it('zeigt eine bezahlte Stufe ohne Grenze als blosse Zahl', async () => {
    apiMock.get.mockResolvedValue(PROFESSIONAL);
    mitAbfrage(<LizenzSettings />);
    expect(await screen.findByTestId('lizenz-stufe')).toHaveTextContent('Professional');
    expect(screen.getByTestId('lizenz-konten')).toHaveTextContent(/^5$/);
    expect(screen.getAllByText('unbegrenzt')).toHaveLength(2);
    expect(screen.getByText(/Muster GmbH/)).toBeInTheDocument();
  });

  it('zeigt das Ablaufdatum als Kalendertag, unabhaengig von der Zeitzone', async () => {
    // Mitternacht UTC ist in Berlin 01:00 -- und kurz vor Mitternacht UTC
    // waere es dort schon der naechste Tag. Gemeint ist der Tag, der dasteht.
    apiMock.get.mockResolvedValue({ ...PROFESSIONAL, expiresAt: '2027-12-31T23:59:59.000Z' });
    mitAbfrage(<LizenzSettings />);
    expect(await screen.findByText(/gültig bis 31\.12\.2027/)).toBeInTheDocument();
  });

  it('zeigt einen Ablauf im Jahr 9999 als unbegrenzt statt als 1.1.10000', async () => {
    // Der Fund vom Orin (25.09.2026): 9999-12-31T23:59:59Z in Ortszeit.
    apiMock.get.mockResolvedValue({ ...PROFESSIONAL, expiresAt: '9999-12-31T23:59:59.000Z' });
    mitAbfrage(<LizenzSettings />);
    expect(await screen.findByText(/Muster GmbH · unbegrenzt gültig/)).toBeInTheDocument();
    expect(screen.queryByText(/10000/)).toBeNull();
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it('kopiert den Fingerabdruck', async () => {
    apiMock.get.mockResolvedValue(COMMUNITY);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mitAbfrage(<LizenzSettings />);
    fireEvent.click(await screen.findByTestId('lizenz-fingerabdruck-kopieren'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(COMMUNITY.hardwareFingerprint));
    expect(await screen.findByText('Kopiert')).toBeInTheDocument();
  });

  it('spielt eine Lizenz ein und entwertet danach die Anzeige', async () => {
    apiMock.get.mockResolvedValueOnce(COMMUNITY).mockResolvedValueOnce(PROFESSIONAL);
    apiMock.post.mockResolvedValue({ success: true, license: { tier: 'professional' } });
    mitAbfrage(<LizenzSettings />);
    const feld = await screen.findByTestId('lizenz-feld');
    fireEvent.change(feld, { target: { value: '  eyJhYmMiOjF9.c2lnbmF0dXI=  ' } });
    fireEvent.click(screen.getByTestId('lizenz-einspielen'));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/license/activate',
        { licenseKey: 'eyJhYmMiOjF9.c2lnbmF0dXI=' },
        { showError: false }
      )
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Professional/));
    expect(await screen.findByTestId('lizenz-stufe')).toHaveTextContent('Professional');
  });

  it('nennt den Grund unter dem Feld, wenn die Lizenz nicht besteht', async () => {
    apiMock.get.mockResolvedValue(COMMUNITY);
    apiMock.post.mockRejectedValue(
      Object.assign(new Error('Die Signatur der Lizenz ist ungueltig'), { status: 400 })
    );
    mitAbfrage(<LizenzSettings />);
    fireEvent.change(await screen.findByTestId('lizenz-feld'), {
      target: { value: 'irgendetwas.mit-punkt' },
    });
    fireEvent.click(screen.getByTestId('lizenz-einspielen'));
    expect(await screen.findByTestId('lizenz-einspielen-fehler')).toHaveTextContent(
      /Signatur der Lizenz ist ungueltig/
    );
  });

  it('sagt, warum eine eingespielte Lizenz nicht gilt', async () => {
    apiMock.get.mockResolvedValue({
      ...COMMUNITY,
      error: 'License is bound to a different device',
    });
    mitAbfrage(<LizenzSettings />);
    expect(await screen.findByTestId('lizenz-abgelehnt')).toHaveTextContent(
      /bound to a different device/
    );
  });
});
