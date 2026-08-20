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

import { render, screen, waitFor } from '@testing-library/react';
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
});
