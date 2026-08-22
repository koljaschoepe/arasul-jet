/**
 * Plan 023 I2 und I3: ein Flow darf anhalten und fragen.
 *
 * Bis hierher galt das ANNAHMEN-PROTOKOLL: ein Flow fragt nicht, er trifft die
 * Annahme und schreibt sie mit. Das bleibt die Voreinstellung; diese Tests
 * decken die zweite Betriebsart ab.
 *
 * Die Frage, an der so etwas scheitert, ist immer dieselbe: was passiert, wenn
 * niemand antwortet? Ein haengender Lauf waere schlechter als eine Annahme,
 * deshalb faellt der Zeitablauf auf die erste Empfehlung zurueck.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const frageStore = require('../../src/services/flows/frageStore');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

afterEach(() => frageStore._reset());

describe('stelleFrage und beantworte', () => {
  test('die Antwort des Nutzers erreicht den wartenden Lauf', async () => {
    const wartet = frageStore.stelleFrage(7, { frage: 'Welcher Kunde?' });
    // Die Frage steht sofort zur Abholung bereit, auch ohne Live-Kanal.
    expect(frageStore.offeneFrage(7)?.frage).toBe('Welcher Kunde?');

    frageStore.beantworte(7, '  Meier GmbH  ');
    await expect(wartet).resolves.toEqual({ antwort: 'Meier GmbH', quelle: 'nutzer' });
    expect(frageStore.offeneFrage(7)).toBeNull();
  });

  test('die Frage geht auch an den Live-Kanal', async () => {
    const gesehen = [];
    const wartet = frageStore.stelleFrage(
      8,
      { frage: 'Kurz oder lang?', optionen: ['kurz', 'lang'] },
      { onEvent: e => gesehen.push(e) }
    );
    expect(gesehen).toEqual([
      { type: 'frage', runId: 8, frage: 'Kurz oder lang?', optionen: ['kurz', 'lang'] },
    ]);
    frageStore.beantworte(8, 'kurz');
    await wartet;
  });

  test('ein kaputter Live-Kanal haelt den Lauf nicht auf', async () => {
    const wartet = frageStore.stelleFrage(
      9,
      { frage: 'X?' },
      {
        onEvent: () => {
          throw new Error('Kanal weg');
        },
      }
    );
    expect(frageStore.offeneFrage(9)).not.toBeNull();
    frageStore.beantworte(9, 'ja');
    await expect(wartet).resolves.toMatchObject({ quelle: 'nutzer' });
  });

  test('hoechstens vier Optionen', async () => {
    const wartet = frageStore.stelleFrage(10, {
      frage: 'X?',
      optionen: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(frageStore.offeneFrage(10).optionen).toEqual(['a', 'b', 'c', 'd']);
    frageStore.beantworte(10, 'a');
    await wartet;
  });

  test('leere Optionen fliegen raus, statt als leerer Knopf zu erscheinen', async () => {
    const wartet = frageStore.stelleFrage(11, { frage: 'X?', optionen: ['a', '', '  ', 'b'] });
    expect(frageStore.offeneFrage(11).optionen).toEqual(['a', 'b']);
    frageStore.beantworte(11, 'a');
    await wartet;
  });

  test('eine leere Frage gibt es nicht', async () => {
    await expect(frageStore.stelleFrage(12, { frage: '   ' })).rejects.toThrow(ValidationError);
  });

  test('zwei Fragen gleichzeitig fuer denselben Lauf nicht', async () => {
    const wartet = frageStore.stelleFrage(13, { frage: 'Erste?' });
    await expect(frageStore.stelleFrage(13, { frage: 'Zweite?' })).rejects.toThrow(
      ValidationError
    );
    frageStore.beantworte(13, 'x');
    await wartet;
  });

  test('eine Antwort ohne Frage ist ein NotFound', () => {
    expect(() => frageStore.beantworte(99, 'ja')).toThrow(NotFoundError);
  });

  test('eine leere Antwort hilft niemandem', async () => {
    const wartet = frageStore.stelleFrage(14, { frage: 'X?' });
    expect(() => frageStore.beantworte(14, '   ')).toThrow(ValidationError);
    // Und die Frage steht noch: eine abgewiesene Antwort darf sie nicht
    // verbrauchen.
    expect(frageStore.offeneFrage(14)).not.toBeNull();
    frageStore.beantworte(14, 'doch was');
    await wartet;
  });
});

describe('wenn niemand antwortet', () => {
  test('nach dem Zeitablauf gilt die erste Empfehlung', async () => {
    // Ein haengender Lauf waere schlechter als eine Annahme.
    const wartet = frageStore.stelleFrage(
      20,
      { frage: 'X?', optionen: ['empfohlen', 'anders'] },
      { warteMs: 5 }
    );
    await expect(wartet).resolves.toEqual({ antwort: 'empfohlen', quelle: 'zeitablauf' });
    expect(frageStore.offeneFrage(20)).toBeNull();
  });

  test('ohne Optionen entscheidet der Lauf selbst', async () => {
    const wartet = frageStore.stelleFrage(21, { frage: 'X?' }, { warteMs: 5 });
    await expect(wartet).resolves.toEqual({ antwort: '', quelle: 'zeitablauf' });
  });
});

describe('verwirf', () => {
  test('loest die Frage auf, statt den Lauf haengen zu lassen', async () => {
    const wartet = frageStore.stelleFrage(30, { frage: 'X?', optionen: ['a'] });
    expect(frageStore.verwirf(30)).toBe(true);
    await expect(wartet).resolves.toEqual({ antwort: 'a', quelle: 'zeitablauf' });
  });

  test('ohne offene Frage passiert nichts', () => {
    expect(frageStore.verwirf(31)).toBe(false);
  });
});

describe('alleOffenen', () => {
  test('nennt jede wartende Frage mit ihrem Lauf', async () => {
    const a = frageStore.stelleFrage(40, { frage: 'A?' });
    const b = frageStore.stelleFrage(41, { frage: 'B?', optionen: ['x'] });
    expect(frageStore.alleOffenen().map(f => f.runId).sort()).toEqual([40, 41]);
    frageStore.beantworte(40, '1');
    frageStore.beantworte(41, '2');
    await Promise.all([a, b]);
    expect(frageStore.alleOffenen()).toEqual([]);
  });
});
