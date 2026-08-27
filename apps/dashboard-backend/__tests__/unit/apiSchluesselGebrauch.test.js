/**
 * „Zuletzt benutzt" an einem API-Schluessel (Nachbesserung zur C5-Abnahme,
 * 27.08.2026).
 *
 * Die Spalte `api_keys.last_used_at` gibt es seit Migration 023, und bis C6
 * schrieb sie niemand: die einzige Stelle, die es tut, ist die
 * Datenbankfunktion `log_api_key_usage()`, und die ruft im ganzen Repo kein
 * Aufrufer. `kit-schluessel.sh liste` und `GET /api/v1/external/api-keys`
 * meldeten deshalb „nie benutzt", waehrend ein Schluessel gerade eine App auf
 * das Geraet rollte.
 *
 * Gemessen wird beides: dass geschrieben wird -- und dass NICHT bei jeder
 * Anfrage geschrieben wird. Ein Geraet, das fuenf Jahre laufen soll, bekommt
 * keine Schreibzeile je Aufruf.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('bcrypt', () => ({ compare: jest.fn().mockResolvedValue(true), hash: jest.fn() }));

const db = require('../../src/database');
const { requireApiKey } = require('../../src/middleware/apiKeyAuth');

const SCHLUESSEL = 'aras_0123456789abcdef';

function zeile(ueberschreibung = {}) {
  return {
    id: 42,
    key_hash: 'egal',
    name: 'Kit',
    rate_limit_per_minute: 600,
    allowed_endpoints: ['app:deploy'],
    expires_at: null,
    is_active: true,
    created_by: 1,
    last_used_at: null,
    app_id: null,
    stand: null,
    ...ueberschreibung,
  };
}

function anfrage() {
  const req = { headers: { 'x-api-key': SCHLUESSEL } };
  const res = { setHeader: jest.fn(), status: jest.fn(() => res), json: jest.fn(() => res) };
  return { req, res };
}

/** Die UPDATE-Aufrufe an `api_keys`, die dieser Lauf abgesetzt hat. */
function vermerke() {
  return db.query.mock.calls.filter(c => /UPDATE public\.api_keys/.test(String(c[0])));
}

beforeEach(() => {
  jest.clearAllMocks();
  // Die Drossel steht im Modulspeicher und zaehlt ueber alle Tests hinweg
  // mit. Deshalb eine grosszuegige Grenze in `zeile()`: gemessen wird hier
  // der Vermerk, nicht die Drossel.
  db.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('requireApiKey vermerkt den Gebrauch', () => {
  it('traegt „zuletzt benutzt" nach, wenn es noch nie dastand', async () => {
    db.query.mockResolvedValueOnce({ rows: [zeile()] });
    const { req, res } = anfrage();
    const next = jest.fn();

    await requireApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(vermerke()).toHaveLength(1);
    expect(vermerke()[0][1]).toEqual([42]);
  });

  it('schreibt NICHT noch einmal, wenn es gerade eben dastand', async () => {
    // Eine Anfrage je Sekunde soll keine Schreibzeile je Sekunde ergeben.
    db.query.mockResolvedValueOnce({ rows: [zeile({ last_used_at: new Date() })] });
    const { req, res } = anfrage();

    await requireApiKey(req, res, jest.fn());

    expect(vermerke()).toHaveLength(0);
  });

  it('schreibt wieder, wenn der Eintrag alt genug ist', async () => {
    const vorEinerStunde = new Date(Date.now() - 60 * 60 * 1000);
    db.query.mockResolvedValueOnce({ rows: [zeile({ last_used_at: vorEinerStunde })] });
    const { req, res } = anfrage();

    await requireApiKey(req, res, jest.fn());

    expect(vermerke()).toHaveLength(1);
  });

  it('haelt die Anfrage nicht auf, wenn der Vermerk scheitert', async () => {
    // Der Schluessel ist gueltig; eine Buchhaltungszeile, die nicht geht,
    // gehoert ins Protokoll und nicht in die Antwort.
    db.query
      .mockResolvedValueOnce({ rows: [zeile()] })
      .mockRejectedValueOnce(new Error('Datenbank weg'));
    const { req, res } = anfrage();
    const next = jest.fn();

    await requireApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('reicht App und Stand des Schluessels an die Route weiter (C4/C6)', async () => {
    db.query.mockResolvedValueOnce({ rows: [zeile({ app_id: 'urlaub', stand: 'live' })] });
    const { req, res } = anfrage();

    await requireApiKey(req, res, jest.fn());

    expect(req.apiKey.appId).toBe('urlaub');
    expect(req.apiKey.stand).toBe('live');
  });

  it('meldet einen Schluessel eines Menschen ohne App und Stand', async () => {
    db.query.mockResolvedValueOnce({ rows: [zeile()] });
    const { req, res } = anfrage();

    await requireApiKey(req, res, jest.fn());

    expect(req.apiKey.appId).toBeNull();
    expect(req.apiKey.stand).toBeNull();
  });
});
