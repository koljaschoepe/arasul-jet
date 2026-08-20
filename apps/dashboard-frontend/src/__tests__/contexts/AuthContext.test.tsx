/**
 * F-02: Vor der Anmeldung darf die Konsole leer bleiben.
 *
 * `GET /auth/me` antwortet ohne Sitzung mit 401, und der Browser schreibt dafuer
 * von sich aus eine Zeile in die Konsole, die kein `try/catch` im Code abfaengt.
 * Am 20.08.2026 auf dem Geraet gemessen: genau eine Meldung, genau diese.
 * Der einzige Weg dahin, dass sie ausbleibt, ist, nicht zu fragen, solange es
 * nichts zu fragen gibt.
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

describe('AuthContext, Sitzungspruefung beim Start', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, username: 'pruefer' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fragt /auth/me nicht, wenn gar kein Token da ist', async () => {
    render(
      <AuthProvider>
        <Anzeige />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('fragt /auth/me nicht, wenn der Token abgelaufen ist', async () => {
    localStorage.setItem('arasul_token', token(-60));

    render(
      <AuthProvider>
        <Anzeige />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('arasul_token')).toBeNull();
  });

  test('raeumt die zwischengespeicherten Nutzerdaten weg, wenn kein Token da ist', async () => {
    localStorage.setItem('arasul_user', JSON.stringify({ id: 1, username: 'pruefer' }));

    render(
      <AuthProvider>
        <Anzeige />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('abgemeldet')).toBeInTheDocument());
    expect(localStorage.getItem('arasul_user')).toBeNull();
  });

  test('fragt /auth/me weiterhin, wenn ein gueltiger Token da ist', async () => {
    localStorage.setItem('arasul_token', token(3600));

    render(
      <AuthProvider>
        <Anzeige />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('angemeldet')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/auth/me');
  });
});
