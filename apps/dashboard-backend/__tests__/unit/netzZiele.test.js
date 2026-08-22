/**
 * Plan 023 H1: wohin eine Erweiterung hinaus darf.
 *
 * Die Zusage aus dem Plan lautet wörtlich: „Die Ziele ausgehender Aufrufe
 * stehen im Manifest und werden vom Backend durchgesetzt, nicht von der
 * Anwendung." Diese Tests prüfen die Durchsetzung.
 *
 * Zwei Wände, und die zweite ist die wichtigere: ein Name im Manifest kann auf
 * 127.0.0.1 zeigen. Absichtlich, oder weil jemand den DNS-Eintrag geändert hat,
 * nachdem die Erweiterung installiert war. Ohne die zweite Wand wäre die erste
 * eine Empfehlung.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const {
  pruefeZiel,
  pruefeAdresse,
  zieleAus,
  verbotenerBereich,
} = require('../../src/services/extensions/netzZiele');
const { ForbiddenError, ValidationError } = require('../../src/utils/errors');

const MANIFEST = { netz: { ziele: ['https://api.datev.de/v1/'] } };

describe('verbotenerBereich', () => {
  test.each([
    ['127.0.0.1', 'das Gerät selbst'],
    ['127.1.2.3', 'das Gerät selbst'],
    ['10.1.2.3', 'privates Netz'],
    ['192.168.1.10', 'privates Netz'],
    ['172.17.0.1', 'privates Netz, auch Docker'],
    ['169.254.169.254', 'Link-Local und Cloud-Metadaten'],
    ['0.0.0.0', 'diese Maschine'],
  ])('%s liegt im eigenen Netz', (ip, was) => {
    expect(verbotenerBereich(ip)).toBe(was);
  });

  test('172.32.0.1 ist NICHT privat', () => {
    // Der private Block endet bei 172.31.255.255. Wer /16 statt /12 rechnet,
    // sperrt hier zu viel und laesst weiter unten zu wenig durch.
    expect(verbotenerBereich('172.32.0.1')).toBeNull();
    expect(verbotenerBereich('172.15.255.255')).toBeNull();
    expect(verbotenerBereich('172.16.0.0')).toBe('privates Netz, auch Docker');
    expect(verbotenerBereich('172.31.255.255')).toBe('privates Netz, auch Docker');
  });

  test('echte Adressen sind erlaubt', () => {
    expect(verbotenerBereich('8.8.8.8')).toBeNull();
    expect(verbotenerBereich('2001:4860:4860::8888')).toBeNull();
  });

  test('IPv6-Schreibweisen fuer dieselbe Sperre', () => {
    // ::ffff:127.0.0.1 ist derselbe Rechner, nur anders geschrieben.
    expect(verbotenerBereich('::1')).toBe('das Gerät selbst');
    expect(verbotenerBereich('::ffff:127.0.0.1')).toBe('das Gerät selbst');
    expect(verbotenerBereich('::ffff:10.0.0.5')).toBe('privates Netz');
    expect(verbotenerBereich('fd00::1')).toBe('privates Netz (IPv6)');
    expect(verbotenerBereich('fe80::1')).toBe('Link-Local (IPv6)');
  });

  test('Unsinn ist keine Adresse', () => {
    expect(verbotenerBereich('')).toBe('leere Adresse');
    expect(verbotenerBereich('999.1.1.1')).toBe('keine erkennbare Adresse');
    expect(verbotenerBereich('abc')).toBe('keine erkennbare Adresse');
  });
});

describe('zieleAus', () => {
  test('liest die Ziele aus dem Manifest', () => {
    expect(zieleAus(MANIFEST)).toEqual([
      { herkunft: 'https://api.datev.de', praefix: '/v1/' },
    ]);
  });

  test('wirft unbrauchbare Eintraege weg, statt zu scheitern', () => {
    const m = { netz: { ziele: ['kein-url', 'http://api.x.de', 'https://gut.de'] } };
    // http fliegt raus: ein Kundengeheimnis geht nicht im Klartext ins Netz.
    expect(zieleAus(m)).toEqual([{ herkunft: 'https://gut.de', praefix: '/' }]);
  });

  test('ohne Manifest-Abschnitt gibt es keine Ziele', () => {
    expect(zieleAus({})).toEqual([]);
    expect(zieleAus(null)).toEqual([]);
    expect(zieleAus({ netz: { ziele: 'https://x.de' } })).toEqual([]);
  });
});

describe('pruefeZiel', () => {
  test('laesst ein deklariertes Ziel durch', () => {
    const url = pruefeZiel('https://api.datev.de/v1/belege?jahr=2026', MANIFEST);
    expect(url.hostname).toBe('api.datev.de');
  });

  test('der Pfad ist ein Praefix, kein Freibrief', () => {
    // Wer /v1/ deklariert, bekommt nicht /admin dazu.
    expect(() => pruefeZiel('https://api.datev.de/admin', MANIFEST)).toThrow(ForbiddenError);
  });

  test('ein anderer Rechner ist ein anderes Ziel', () => {
    expect(() => pruefeZiel('https://boese.de/v1/', MANIFEST)).toThrow(ForbiddenError);
  });

  test('ein anderer Port ist ein anderes Ziel', () => {
    expect(() => pruefeZiel('https://api.datev.de:8443/v1/', MANIFEST)).toThrow(ForbiddenError);
  });

  test('ohne Ziele im Manifest geht gar nichts', () => {
    const err = (() => {
      try {
        pruefeZiel('https://api.datev.de/v1/', {});
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toMatch(/netz\.ziele/);
  });

  test('http wird abgelehnt, mit Begruendung', () => {
    const m = { netz: { ziele: ['https://api.datev.de/'] } };
    expect(() => pruefeZiel('http://api.datev.de/', m)).toThrow(/Nur https/);
  });

  test('was keine Adresse ist, scheitert als Eingabefehler', () => {
    expect(() => pruefeZiel('nicht-mal-eine-url', MANIFEST)).toThrow(ValidationError);
  });
});

describe('pruefeAdresse', () => {
  test('eine oeffentliche Adresse geht durch', async () => {
    await expect(
      pruefeAdresse('api.datev.de', async () => [{ address: '81.2.3.4', family: 4 }])
    ).resolves.toEqual(['81.2.3.4']);
  });

  test('ein Name, der aufs Geraet zeigt, wird abgewiesen', async () => {
    // Der Fall, gegen den die zweite Wand steht.
    await expect(
      pruefeAdresse('boese.de', async () => [{ address: '127.0.0.1', family: 4 }])
    ).rejects.toThrow(/das Gerät selbst/);
  });

  test('ALLE Adressen werden geprueft, nicht nur die erste', async () => {
    // Sonst genuegt ein zweiter A-Eintrag ins eigene Netz, und die Verbindung
    // nimmt zufaellig den.
    await expect(
      pruefeAdresse('gemischt.de', async () => [
        { address: '81.2.3.4', family: 4 },
        { address: '172.17.0.1', family: 4 },
      ])
    ).rejects.toThrow(/Docker/);
  });

  test('ein nicht aufloesbarer Name ist ein Eingabefehler', async () => {
    await expect(
      pruefeAdresse('gibtsnicht.de', async () => {
        const e = new Error('not found');
        e.code = 'ENOTFOUND';
        throw e;
      })
    ).rejects.toThrow(ValidationError);
  });

  test('ein Name ohne Adresse ist kein stiller Erfolg', async () => {
    await expect(pruefeAdresse('leer.de', async () => [])).rejects.toThrow(ValidationError);
  });
});
