/**
 * Unit-Tests für den eigenen Claude-OAuth-PKCE-Handshake (Plan 015, Phase 3).
 * Netzwerk (fetch) und der Tresor (externalCredentialsService) sind gemockt.
 */

const crypto = require('crypto');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockSave = jest.fn().mockResolvedValue({ provider: 'claude-central' });
const mockLoad = jest.fn();
const mockApply = jest.fn().mockResolvedValue(2);
jest.mock('../../src/services/sandbox/externalCredentialsService', () => ({
  PROVIDER_CENTRAL: 'claude-central',
  saveCredentials: (...a) => mockSave(...a),
  loadCredentials: (...a) => mockLoad(...a),
  applyCentralAuthToUserContainers: (...a) => mockApply(...a),
}));

const svc = require('../../src/services/sandbox/claudeOauthService');

function parseUrl() {
  const { authorizeUrl, state } = svc.startClaudeOAuth(42);
  return { u: new URL(authorizeUrl), state };
}

describe('claudeOauthService.startClaudeOAuth', () => {
  afterEach(() => svc._internals.PENDING.clear());

  it('baut eine korrekte Authorize-URL mit S256-code_challenge', () => {
    const { u, state } = parseUrl();
    expect(u.origin + u.pathname).toBe('https://claude.ai/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe(svc._internals.CLIENT_ID);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe(svc._internals.REDIRECT_URI);
    expect(u.searchParams.get('scope')).toBe(svc._internals.SCOPE);
    expect(u.searchParams.get('state')).toBe(state);
    const challenge = u.searchParams.get('code_challenge');
    expect(challenge).toBeTruthy();
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
  });

  it('das gespeicherte Verifier erzeugt genau die veröffentlichte Challenge', () => {
    const { u } = parseUrl();
    const pending = svc._internals.PENDING.get('42');
    const expected = crypto
      .createHash('sha256')
      .update(pending.verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(u.searchParams.get('code_challenge')).toBe(expected);
  });
});

describe('claudeOauthService.completeClaudeOAuth', () => {
  afterEach(() => {
    svc._internals.PENDING.clear();
    jest.clearAllMocks();
    delete global.fetch;
  });

  it('wirft ohne laufende Anmeldung', async () => {
    await expect(svc.completeClaudeOAuth(1, 'code#state')).rejects.toThrow(/laufende Anmeldung/);
  });

  it('wirft bei falschem State (CSRF)', async () => {
    const { state } = svc.startClaudeOAuth(7);
    await expect(svc.completeClaudeOAuth(7, `abc#${state}x`)).rejects.toThrow(/State/);
  });

  it('tauscht Code→Token, speichert das Bündel und injiziert', async () => {
    const { state } = svc.startClaudeOAuth(7);
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'sk-ant-oat01-XYZ',
          refresh_token: 'sk-ant-ort01-ABC',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user:inference user:profile',
        }),
    });
    const r = await svc.completeClaudeOAuth(7, `thecode#${state}`);
    expect(global.fetch).toHaveBeenCalledTimes(1); // genau EIN Versuch bei Erfolg
    expect(r).toMatchObject({ configured: true, mode: 'oauth', applied_to: 2 });
    expect(r.expiresAt).toBeGreaterThan(Date.now());
    const [, provider, bundle] = mockSave.mock.calls[0];
    expect(provider).toBe('claude-central');
    expect(bundle).toMatchObject({
      mode: 'oauth',
      accessToken: 'sk-ant-oat01-XYZ',
      refreshToken: 'sk-ant-ort01-ABC',
    });
    expect(svc._internals.PENDING.has('7')).toBe(false); // Pending aufgeräumt
  });

  it('bricht bei 429 sofort ab (kein Weiterhämmern auf dem Code)', async () => {
    const { state } = svc.startClaudeOAuth(9);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status: 429, ok: false, text: async () => 'rate limited' });
    await expect(svc.completeClaudeOAuth(9, `c#${state}`)).rejects.toThrow(/Rate-Limit/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fällt bei nicht-fatalem Host-Fehler (404) auf den nächsten Combo zurück', async () => {
    const { state } = svc.startClaudeOAuth(11);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ status: 404, ok: false, text: async () => 'not found' })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ access_token: 'sk-ant-oat01-OK', expires_in: 3600 }),
      });
    const r = await svc.completeClaudeOAuth(11, `code#${state}`);
    expect(r).toMatchObject({ configured: true, mode: 'oauth' });
    expect(global.fetch).toHaveBeenCalledTimes(2); // erster 404 → zweiter Combo
  });

  it('bricht bei invalid_grant sofort ab (Code entwertet — kein Verbrennen)', async () => {
    const { state } = svc.startClaudeOAuth(13);
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      ok: false,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    });
    await expect(svc.completeClaudeOAuth(13, `code#${state}`)).rejects.toThrow(
      /abgelaufen|benutzt/
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('claudeOauthService.refreshClaudeOAuth', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  it('erneuert über den Refresh-Token und behält den alten, falls keiner zurückkommt', async () => {
    mockLoad.mockResolvedValue({ mode: 'oauth', refreshToken: 'sk-ant-ort01-OLD' });
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: 'sk-ant-oat01-NEW', expires_in: 3600 }),
    });
    const r = await svc.refreshClaudeOAuth(3);
    expect(r).toMatchObject({ configured: true, mode: 'oauth' });
    const [, , bundle] = mockSave.mock.calls[0];
    expect(bundle.accessToken).toBe('sk-ant-oat01-NEW');
    expect(bundle.refreshToken).toBe('sk-ant-ort01-OLD'); // alten behalten
  });

  it('wirft ohne hinterlegten Refresh-Token', async () => {
    mockLoad.mockResolvedValue({ mode: 'token', value: 'x' });
    await expect(svc.refreshClaudeOAuth(3)).rejects.toThrow(/erneuerbarer OAuth-Zugang/);
  });
});

describe('claudeOauthService.ensureFreshToken (Lazy-Refresh)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  it('erneuert, wenn der Token bald abläuft (<5 min)', async () => {
    mockLoad.mockResolvedValue({
      mode: 'oauth',
      refreshToken: 'r',
      expiresAt: Date.now() + 60 * 1000, // 1 min
    });
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: 'sk-ant-oat01-NEW', expires_in: 3600 }),
    });
    const did = await svc.ensureFreshToken(5);
    expect(did).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('lässt einen noch frischen Token unangetastet (kein Netz-Call)', async () => {
    mockLoad.mockResolvedValue({
      mode: 'oauth',
      refreshToken: 'r',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 h
    });
    global.fetch = jest.fn();
    const did = await svc.ensureFreshToken(5);
    expect(did).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('scheitert nie hart, wenn der Refresh fehlschlägt (429)', async () => {
    mockLoad.mockResolvedValue({
      mode: 'oauth',
      refreshToken: 'r',
      expiresAt: Date.now() + 60 * 1000,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status: 429, ok: false, text: async () => 'rate limited' });
    const did = await svc.ensureFreshToken(5);
    expect(did).toBe(false); // geschluckt, kein Wurf
  });

  it('ignoriert Nicht-OAuth-Modi', async () => {
    mockLoad.mockResolvedValue({ mode: 'token', value: 'x' });
    const did = await svc.ensureFreshToken(5);
    expect(did).toBe(false);
  });
});
