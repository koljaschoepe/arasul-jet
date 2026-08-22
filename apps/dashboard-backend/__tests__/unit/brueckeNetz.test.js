/**
 * Plan 023 H1: der ausgehende Aufruf selbst.
 *
 * `netzZiele.test.js` prüft, WELCHE Adresse durchdarf. Hier geht es um alles
 * andere am Aufruf: Methoden, Kopfzeilen, Umleitungen, Zeitlimit, Größe.
 *
 * Die wichtigste Entscheidung steht bei den Umleitungen. Eine Umleitung ist
 * eine zweite Adresse, die niemand geprüft hat; wer ihr folgt, hebt beide
 * Wände auf, die eine Zeile vorher standen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const brueckeService = require('../../src/services/extensions/brueckeService');
const { ValidationError } = require('../../src/utils/errors');

const MANIFEST = { netz: { ziele: ['https://api.datev.de/v1/'] } };

/** Ein fetch-Doppel, das mitschreibt, womit es gerufen wurde. */
function fakeFetch(antwort = {}) {
  const rufe = [];
  const f = jest.fn(async (url, opts) => {
    rufe.push({ url, opts });
    return {
      status: antwort.status ?? 200,
      headers: { forEach: (cb) => Object.entries(antwort.kopf ?? {}).forEach(([k, v]) => cb(v, k)) },
      text: async () => antwort.rumpf ?? '{"ok":true}',
    };
  });
  f.rufe = rufe;
  return f;
}

const aufloesen = async () => [{ address: '81.2.3.4', family: 4 }];

function deps(f) {
  return { fetch: f, aufloesen };
}

describe('netzAufruf (Plan 023 H1)', () => {
  test('reicht Antwort, Status und Kopfzeilen durch', async () => {
    const f = fakeFetch({ status: 201, kopf: { 'content-type': 'application/json' } });
    const res = await brueckeService.netzAufruf(
      'meine-ext',
      MANIFEST,
      { url: 'https://api.datev.de/v1/belege', methode: 'POST', rumpf: '{"a":1}' },
      deps(f)
    );
    expect(res.status).toBe(201);
    expect(res.kopf['content-type']).toBe('application/json');
    expect(res.rumpf).toBe('{"ok":true}');
    expect(res.gekuerzt).toBe(false);
    expect(f.rufe[0].opts.method).toBe('POST');
    expect(f.rufe[0].opts.body).toBe('{"a":1}');
  });

  test('folgt KEINER Umleitung', async () => {
    // Der eigentliche Punkt. Eine Umleitung ist eine zweite Adresse, die
    // niemand geprueft hat.
    const f = fakeFetch({ status: 302, kopf: { location: 'https://boese.de/' } });
    const res = await brueckeService.netzAufruf(
      'meine-ext',
      MANIFEST,
      { url: 'https://api.datev.de/v1/x' },
      deps(f)
    );
    expect(f.rufe[0].opts.redirect).toBe('manual');
    // Die Erweiterung sieht die Umleitung und kann selbst entscheiden; dann
    // laeuft es wieder durch alle Wände.
    expect(res.status).toBe(302);
    expect(res.kopf.location).toBe('https://boese.de/');
  });

  test('GET schickt keinen Rumpf mit', async () => {
    const f = fakeFetch();
    await brueckeService.netzAufruf(
      'meine-ext',
      MANIFEST,
      { url: 'https://api.datev.de/v1/x', methode: 'GET', rumpf: 'egal' },
      deps(f)
    );
    expect(f.rufe[0].opts.body).toBeUndefined();
  });

  test('eine fremde Methode wird abgelehnt', async () => {
    await expect(
      brueckeService.netzAufruf(
        'meine-ext',
        MANIFEST,
        { url: 'https://api.datev.de/v1/x', methode: 'TRACE' },
        deps(fakeFetch())
      )
    ).rejects.toThrow(ValidationError);
  });

  test('host, cookie und content-length darf die Erweiterung nicht setzen', async () => {
    for (const kopfzeile of ['Host', 'cookie', 'Content-Length', 'connection']) {
      await expect(
        brueckeService.netzAufruf(
          'meine-ext',
          MANIFEST,
          { url: 'https://api.datev.de/v1/x', kopf: { [kopfzeile]: 'x' } },
          deps(fakeFetch())
        )
      ).rejects.toThrow(new RegExp(kopfzeile, 'i'));
    }
  });

  test('eigene Kopfzeilen gehen durch', async () => {
    const f = fakeFetch();
    await brueckeService.netzAufruf(
      'meine-ext',
      MANIFEST,
      { url: 'https://api.datev.de/v1/x', kopf: { authorization: 'Bearer x' } },
      deps(f)
    );
    expect(f.rufe[0].opts.headers.authorization).toBe('Bearer x');
  });

  test('eine zu grosse Antwort wird gekuerzt und sagt es', async () => {
    const gross = 'x'.repeat(2 * 1024 * 1024);
    const res = await brueckeService.netzAufruf(
      'meine-ext',
      MANIFEST,
      { url: 'https://api.datev.de/v1/x' },
      deps(fakeFetch({ rumpf: gross }))
    );
    expect(res.gekuerzt).toBe(true);
    expect(res.rumpf.length).toBeLessThan(gross.length);
  });

  test('ein Abbruch wird als Dienst-Problem gemeldet, nicht als Eingabefehler', async () => {
    const f = jest.fn(async () => {
      const e = new Error('abgebrochen');
      e.name = 'AbortError';
      throw e;
    });
    await expect(
      brueckeService.netzAufruf(
        'meine-ext',
        MANIFEST,
        { url: 'https://api.datev.de/v1/x' },
        deps(f)
      )
    ).rejects.toThrow(/nicht innerhalb/);
  });

  test('ein Ziel ausserhalb des Manifests kommt gar nicht bis zum Netz', async () => {
    const f = fakeFetch();
    await expect(
      brueckeService.netzAufruf(
        'meine-ext',
        MANIFEST,
        { url: 'https://boese.de/' },
        deps(f)
      )
    ).rejects.toThrow(/steht nicht in den Zielen/);
    expect(f.rufe).toHaveLength(0);
  });

  test('ein Name, der aufs Geraet zeigt, kommt gar nicht bis zum Netz', async () => {
    const f = fakeFetch();
    await expect(
      brueckeService.netzAufruf(
        'meine-ext',
        MANIFEST,
        { url: 'https://api.datev.de/v1/x' },
        { fetch: f, aufloesen: async () => [{ address: '127.0.0.1', family: 4 }] }
      )
    ).rejects.toThrow(/das Gerät selbst/);
    expect(f.rufe).toHaveLength(0);
  });
});
