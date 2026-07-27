/**
 * Unit-Tests für den 5-Feld-Cron-Auswerter (Plan 013, B8).
 *
 * Rein — feste Daten rein, erwartete Treffer/Fälligkeiten raus. Deckt die
 * Feld-Syntax (*, Schrittweite, Bereich, Liste), die Vixie-ODER-Regel für
 * Tag/Wochentag und die Fälligkeits-Suche ab.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const { parseCron, istGueltig, naechsteFaelligkeit, passt, feldMenge } = require('../../src/services/flows/cronExpr');

describe('feldMenge', () => {
  test('* deckt den ganzen Bereich', () => {
    expect(feldMenge('*', [0, 5])).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });
  test('Schrittweite */2', () => {
    expect(feldMenge('*/2', [0, 6])).toEqual(new Set([0, 2, 4, 6]));
  });
  test('Bereich und Liste kombiniert', () => {
    expect(feldMenge('1-3,5', [0, 9])).toEqual(new Set([1, 2, 3, 5]));
  });
  test('exakter Wert', () => {
    expect(feldMenge('8', [0, 23])).toEqual(new Set([8]));
  });
  test('außerhalb des Bereichs wirft', () => {
    expect(() => feldMenge('60', [0, 59])).toThrow();
  });
});

describe('parseCron / istGueltig', () => {
  test('gültiger Ausdruck', () => {
    expect(istGueltig('0 8 * * 1-5')).toBe(true);
  });
  test('falsche Feldzahl ist ungültig', () => {
    expect(istGueltig('0 8 * *')).toBe(false);
    expect(istGueltig('0 8 * * * *')).toBe(false);
  });
  test('7 gilt als Sonntag', () => {
    const m = parseCron('0 0 * * 7');
    expect(m.wochentag.has(0)).toBe(true);
  });
});

describe('passt', () => {
  test('täglich 8:00 trifft nur um 8:00', () => {
    const m = parseCron('0 8 * * *');
    // 2026-07-27 ist ein Montag.
    expect(passt(m, new Date(2026, 6, 27, 8, 0))).toBe(true);
    expect(passt(m, new Date(2026, 6, 27, 8, 1))).toBe(false);
    expect(passt(m, new Date(2026, 6, 27, 9, 0))).toBe(false);
  });

  test('Wochentags-Filter (Mo–Fr)', () => {
    const m = parseCron('0 9 * * 1-5');
    expect(passt(m, new Date(2026, 6, 27, 9, 0))).toBe(true); // Montag
    expect(passt(m, new Date(2026, 6, 25, 9, 0))).toBe(false); // Samstag
    expect(passt(m, new Date(2026, 6, 26, 9, 0))).toBe(false); // Sonntag
  });

  test('Vixie-ODER: Tag UND Wochentag beide gesetzt → eines genügt', () => {
    // 15. des Monats ODER Montag.
    const m = parseCron('0 0 15 * 1');
    expect(passt(m, new Date(2026, 6, 15, 0, 0))).toBe(true); // 15. (Mittwoch)
    expect(passt(m, new Date(2026, 6, 27, 0, 0))).toBe(true); // Montag (nicht 15.)
    expect(passt(m, new Date(2026, 6, 28, 0, 0))).toBe(false); // Dienstag, nicht 15.
  });
});

describe('naechsteFaelligkeit', () => {
  test('nächster 8-Uhr-Termin ist strikt nach dem Startzeitpunkt', () => {
    const next = naechsteFaelligkeit('0 8 * * *', new Date(2026, 6, 27, 8, 0, 30));
    // 8:00:30 → nächster ist morgen 8:00 (die aktuelle Minute zählt nicht mehr).
    expect(next).toEqual(new Date(2026, 6, 28, 8, 0));
  });

  test('stündlich: nächste volle Stunde', () => {
    const next = naechsteFaelligkeit('0 * * * *', new Date(2026, 6, 27, 8, 15));
    expect(next).toEqual(new Date(2026, 6, 27, 9, 0));
  });

  test('unerfüllbarer Ausdruck liefert null', () => {
    // 31. Februar gibt es nie.
    const next = naechsteFaelligkeit('0 0 31 2 *', new Date(2026, 0, 1, 0, 0));
    expect(next).toBeNull();
  });
});
