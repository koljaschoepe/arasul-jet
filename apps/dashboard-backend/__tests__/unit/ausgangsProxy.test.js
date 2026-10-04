/**
 * Der Ausgang der Apps (J38): der Zugang, den der Proxy prueft, die Regeln, die
 * er holt, die Zahlen, die er abgibt, und die Seite, die der Administrator sieht.
 * Ob wirklich nur die freigegebenen Hostnamen durchkommen, misst
 * `scripts/test/ausgang-abnahme.sh` am Geraet und `services/egress-proxy/test`.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));

process.env.JWT_SECRET = 'x'.repeat(40);
const db = require('../../src/database');
const ausgang = require('../../src/services/app/ausgangsProxy');
// Derselbe Rechenweg wie im Proxy -- der Test haelt beide Seiten zusammen.
const { tokenFuer: proxyToken, leseZugang } = require('../../../../services/egress-proxy/proxy');

describe('Zugang', () => {
  it('stimmt mit dem Pruefen im Proxy ueberein', () => {
    const name = 'arasul-app-belege-live';
    const url = new URL(ausgang.umgebung(name).HTTPS_PROXY);
    expect(url.hostname).toBe('egress-proxy');
    expect(url.port).toBe('3128');
    const kopf = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${url.password}`).toString('base64')}`;
    expect(leseZugang(kopf, process.env.JWT_SECRET)).toEqual({ appId: 'belege', stand: 'live' });
    expect(ausgang.tokenFuer('dienst')).toBe(proxyToken(process.env.JWT_SECRET, 'dienst'));
  });

  it('der Dienst-Token des Proxys gilt, ein fremder nicht', () => {
    expect(ausgang.dienstTokenGueltig(ausgang.tokenFuer('dienst'))).toBe(true);
    expect(ausgang.dienstTokenGueltig(ausgang.tokenFuer('arasul-app-a-live'))).toBe(false);
    expect(ausgang.dienstTokenGueltig(undefined)).toBe(false);
  });
});

describe('Regeln und Zahlen', () => {
  beforeEach(() => db.query.mockReset());

  it('Regeln je App und Stand aus den Manifesten', async () => {
    db.query.mockResolvedValue({
      rows: [
        { app_id: 'a', stand: 'live', manifest: { verbindungen: ['example.org'] } },
        { app_id: 'a', stand: 'test', manifest: {} },
      ],
    });
    expect(await ausgang.regeln()).toEqual({ 'a:live': ['example.org'], 'a:test': [] });
  });

  it('nimmt abgewiesene Namen jenseits der Grenze unter (weitere) auf', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 100, da: false }] })
      .mockResolvedValueOnce({ rows: [] });
    await ausgang.nimmAuf([
      {
        app_id: 'a',
        stand: 'live',
        host: 'neu.example',
        ergebnis: 'abgewiesen',
        anzahl: 2,
        zuletzt: '2026-10-02T10:00:00Z',
      },
    ]);
    expect(db.query.mock.calls[1][1]).toEqual([
      'a',
      'live',
      '(weitere)',
      'abgewiesen',
      2,
      '2026-10-02T10:00:00Z',
    ]);
  });

  it('zaehlt die Plattform und wirft nie', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await ausgang.zaehlePlattform('https://API.Anthropic.com/v1/models');
    expect(db.query.mock.calls[0][1]).toEqual(['api.anthropic.com']);
    db.query.mockRejectedValueOnce(new Error('aus'));
    await expect(ausgang.zaehlePlattform('https://x.org')).resolves.toBeUndefined();
    await expect(ausgang.zaehlePlattform('kaputt')).resolves.toBeUndefined();
  });

  it('uebersicht: eingetragen, genutzt, abgewiesen je App, dazu die Plattform', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { app_id: 'a', stand: 'live', manifest: { verbindungen: ['example.org'] } },
          { app_id: 'a', stand: 'test', manifest: { verbindungen: ['example.org'] } },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            quelle: 'app',
            app_id: 'a',
            stand: 'live',
            host: 'example.org',
            ergebnis: 'erlaubt',
            anzahl: '3',
            zuletzt: '2026-10-02T10:00:00Z',
          },
          {
            quelle: 'app',
            app_id: 'a',
            stand: 'test',
            host: 'example.org',
            ergebnis: 'erlaubt',
            anzahl: '1',
            zuletzt: '2026-10-02T11:00:00Z',
          },
          {
            quelle: 'app',
            app_id: 'a',
            stand: 'live',
            host: 'boese.example',
            ergebnis: 'abgewiesen',
            anzahl: '5',
            zuletzt: '2026-10-02T09:00:00Z',
          },
          {
            quelle: 'app',
            app_id: 'a',
            stand: 'test',
            host: 'example.org',
            ergebnis: 'abgewiesen',
            anzahl: '2',
            zuletzt: '2026-10-02T08:30:00Z',
          },
          {
            quelle: 'plattform',
            app_id: '',
            stand: '',
            host: 'api.anthropic.com',
            ergebnis: 'erlaubt',
            anzahl: '7',
            zuletzt: '2026-10-02T08:00:00Z',
          },
        ],
      });
    const u = await ausgang.uebersicht();
    expect(u.apps[0].eingetragen).toEqual([{ host: 'example.org', staende: ['live', 'test'] }]);
    expect(u.apps[0].genutzt).toEqual([
      {
        host: 'example.org',
        anzahl: 4,
        zuletzt: '2026-10-02T11:00:00Z',
        staende: ['live', 'test'],
      },
    ]);
    // Rot nur, wenn ein EINGETRAGENER Name abgewiesen wurde (M5): dann kann die
    // App nicht arbeiten. Einen fremden Namen abzuweisen ist die Aufgabe des Proxys.
    expect(u.apps[0].abgewiesen).toEqual([
      expect.objectContaining({ host: 'boese.example', anzahl: 5, stoerung: false }),
      expect.objectContaining({ host: 'example.org', anzahl: 2, stoerung: true }),
    ]);
    expect(u.apps[1]).toMatchObject({ eingetragen: [], genutzt: [], abgewiesen: [] });
    expect(u.plattform.genutzt[0]).toMatchObject({ host: 'api.anthropic.com', anzahl: 7 });
  });
});
