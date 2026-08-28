/**
 * F-02: Vor der Anmeldung darf die Konsole leer bleiben.
 *
 * `GET /auth/me` antwortet ohne Sitzung mit 401, und der Browser schreibt dafuer
 * von sich aus eine Zeile in die Konsole, die kein `try/catch` im Code abfaengt.
 * Am 20.08.2026 auf dem Geraet gemessen: genau eine Meldung, genau diese.
 *
 * Geloest ueber `GET /auth/session`, einen Pruefpunkt, der in beiden Faellen mit
 * 200 antwortet und im Rumpf sagt, welcher es ist. Der Server entscheidet damit
 * weiter allein ueber die Sitzung: ein Aufrufer, den nur das httpOnly-Cookie
 * `arasul_session` ausweist, wird weiter erkannt, obwohl die Seite dieses Cookie
 * nie sehen kann.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

function base64url(o: object): string {
  return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function token(sekundenBisAblauf: number): string {
  const exp = Math.floor(Date.now() / 1000) + sekundenBisAblauf;
  return `kopf.${base64url({ sub: 1, exp })}.unterschrift`;
}

function Anzeige() {
  const { isAuthenticated, loading } = useAuth();
  return <div>{loading ? 'prueft' : isAuthenticated ? 'angemeldet' : 'abgemeldet'}</div>;
}

function zeichne() {
  return render(
    <AuthProvider>
      <Anzeige />
    </AuthProvider>
  );
}

describe('AuthContext, Sitzungspruefung beim Start', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  function antwortet(rumpf: unknown, ok = true) {
    fetchSpy.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => rumpf });
  }

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fragt den Pruefpunkt, nicht die geschuetzte Route', async () => {
    antwortet({ authenticated: false, user: null });
    zeichne();

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    const angefragt = String(fetchSpy.mock.calls[0]?.[0]);
    expect(angefragt).toContain('/auth/session');
    expect(angefragt).not.toContain('/auth/me');
  });

  // Der Kern von F-02: ohne Sitzung wird trotzdem gefragt, und die Antwort ist
  // trotzdem 200. Nur so bleibt die Konsole leer, ohne dass die Seite selbst
  // entscheidet, wer angemeldet ist.
  test('fragt auch ohne jedes lokale Merkmal und bleibt abgemeldet', async () => {
    antwortet({ authenticated: false, user: null });
    zeichne();

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Das Sitzungscookie ist httpOnly, die Seite sieht es nie. Wer hier auf ein
  // lokales Merkmal prueft, wirft genau diese Sitzung weg.
  test('erkennt eine Sitzung, die nur das Cookie ausweist', async () => {
    antwortet({ authenticated: true, user: { id: 1, username: 'pruefer' } });
    zeichne();

    await waitFor(() => expect(screen.getByText('angemeldet')).toBeInTheDocument());
    expect(localStorage.getItem('arasul_token')).toBeNull();
  });

  test('meldet an, wenn der Pruefpunkt eine Sitzung bestaetigt', async () => {
    localStorage.setItem('arasul_token', token(3600));
    antwortet({ authenticated: true, user: { id: 1, username: 'pruefer' } });
    zeichne();

    await waitFor(() => expect(screen.getByText('angemeldet')).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('arasul_user') ?? 'null')).toEqual({
      id: 1,
      username: 'pruefer',
    });
  });

  test('raeumt Token und zwischengespeicherten Nutzer weg, wenn keine Sitzung besteht', async () => {
    localStorage.setItem('arasul_token', token(3600));
    localStorage.setItem('arasul_user', JSON.stringify({ id: 1, username: 'pruefer' }));
    antwortet({ authenticated: false, user: null });
    zeichne();

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    expect(localStorage.getItem('arasul_token')).toBeNull();
    expect(localStorage.getItem('arasul_user')).toBeNull();
  });

  // P2.1.1: bei einem Netzwerkfehler wird die Sitzung NICHT aus dem localStorage
  // wiederbelebt. Der Server koennte den Token widerrufen haben.
  test('belebt bei einem Netzwerkfehler nichts wieder', async () => {
    localStorage.setItem('arasul_token', token(3600));
    localStorage.setItem('arasul_user', JSON.stringify({ id: 1, username: 'pruefer' }));
    fetchSpy.mockRejectedValue(new Error('Failed to fetch'));
    zeichne();

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
  });

  // Der Pruefpunkt antwortet auf beide Faelle mit 200. Alles andere ist keine
  // Aussage ueber die Sitzung, und ein Serverschluckauf darf keinen angemeldeten
  // Nutzer abmelden. Vor C3 war das nicht zu unterscheiden, weil /auth/me auf
  // "nicht angemeldet" selbst mit 401 antwortete.
  describe.each([
    [429, 'einer Sperre durch den Rate-Limiter'],
    [503, 'einem Serverfehler'],
    [502, 'einem Proxy dazwischen'],
  ])('bei %i, %s', (status: number) => {
    test('bleibt der Token liegen', async () => {
      localStorage.setItem('arasul_token', token(3600));
      antwortet({ error: { code: 'RATE_LIMITED' } }, false);
      fetchSpy.mockResolvedValue({ ok: false, status, json: async () => ({}) });
      zeichne();

      await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
      expect(localStorage.getItem('arasul_token')).not.toBeNull();
    });
  });

  /**
   * Der Fund der Oberflaechen-Abnahme am Orin (28.08.2026): einer von vier
   * Laeufen fand die Seite „Neues Passwort" bei 1024 px nicht, die Breiten
   * davor und danach schon. Eine einzelne verlorene Anfrage, und der
   * angemeldete Mensch stand auf der Anmeldung -- dieselbe Klasse wie die
   * nachgeladenen Buendel aus D6.
   */
  describe('wenn eine einzelne Probe verloren geht', () => {
    test('haelt die Sitzung, weil der zweite Versuch traegt', async () => {
      localStorage.setItem('arasul_token', token(3600));
      fetchSpy.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authenticated: true, user: { id: 1, username: 'pruefer' } }),
      });
      zeichne();

      await waitFor(() => expect(screen.getByText('angemeldet')).toBeInTheDocument());
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    // Ein 429 ist eine Antwort, die der Server gegeben hat. Sofort noch einmal
    // anzuklopfen macht sie nur wahrer -- und verbrennt die Drossel.
    test('wiederholt einen 429 nicht', async () => {
      localStorage.setItem('arasul_token', token(3600));
      fetchSpy.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
      zeichne();

      await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Abmelden ist die EINZIGE Stelle, die das httpOnly-Cookie `arasul_session`
 * loeschen kann. Geht sie daneben, bleibt eine tote Sitzung im Browser stehen,
 * die niemand mehr wegbekommt -- die Oberflaeche zeigt die Anmeldung, der
 * Browser traegt weiter ein Cookie. Der zweite Fund der Oberflaechen-Abnahme am
 * Orin (28.08.2026), einer von vier Laeufen.
 */
describe('AuthContext, Abmelden', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  function Abmelder() {
    const { logout, isAuthenticated } = useAuth();
    return (
      <button type="button" onClick={() => void logout()}>
        {isAuthenticated ? 'angemeldet' : 'abgemeldet'}
      </button>
    );
  }

  /** Nur die Antwort auf `POST /auth/logout` interessiert; die Probe traegt. */
  function beimAbmelden(antworten: Array<{ ok: boolean; status: number }>) {
    let dran = 0;
    fetchSpy.mockImplementation((url: string) => {
      if (String(url).includes('/auth/session')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, user: { id: 1, username: 'pruefer' } }),
        });
      }
      const antwort = antworten[Math.min(dran, antworten.length - 1)];
      dran += 1;
      return Promise.resolve({ ...antwort, json: async () => ({}) });
    });
    return () => dran;
  }

  async function abmelden() {
    render(
      <AuthProvider>
        <Abmelder />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('angemeldet')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button').click();
    });
    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
  }

  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'arasul_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('ruft den Weg genau einmal, wenn er traegt', async () => {
    const versuche = beimAbmelden([{ ok: true, status: 200 }]);
    await abmelden();
    expect(versuche()).toBe(1);
  });

  /**
   * Der Startpasswort-Wechsel ist selbst eine Mutation, und jede angenommene
   * Mutation DREHT `arasul_csrf`. Chromium fuehrt `document.cookie` im Renderer
   * als Kopie und zieht sie erst kurz danach nach -- das Abmelden folgt dem
   * Wechsel auf dem Fuss und liest womoeglich noch den alten Wert. Der Server
   * antwortet dann 403 CSRF_INVALID, BEVOR die Route laeuft, und
   * `res.clearCookie` faellt aus. Eine abgelehnte Anfrage dreht das Cookie
   * nicht: der zweite Versuch liest es neu und trifft.
   */
  test('liest das gedrehte CSRF-Cookie neu, wenn der erste Versuch 403 sagt', async () => {
    document.cookie = 'arasul_csrf=alt; path=/';
    const gesehen: Array<string | undefined> = [];
    let dran = 0;
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/auth/session')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, user: { id: 1, username: 'pruefer' } }),
        });
      }
      gesehen.push((init?.headers as Record<string, string>)?.['X-CSRF-Token']);
      dran += 1;
      if (dran === 1) {
        // Genau hier zieht der Browser seine Kopie nach.
        document.cookie = 'arasul_csrf=gedreht; path=/';
        return Promise.resolve({ ok: false, status: 403, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    await abmelden();

    expect(gesehen).toEqual(['alt', 'gedreht']);
  });

  // Auch wenn beide Versuche danebengehen, meldet die Oberflaeche ab: der
  // Mensch soll nicht auf einem Bildschirm festhaengen, den er verlassen will.
  test('meldet die Oberflaeche auch ab, wenn der Weg zweimal danebengeht', async () => {
    const versuche = beimAbmelden([{ ok: false, status: 403 }]);
    await abmelden();
    expect(versuche()).toBe(2);
    expect(localStorage.getItem('arasul_token')).toBeNull();
  });
});
