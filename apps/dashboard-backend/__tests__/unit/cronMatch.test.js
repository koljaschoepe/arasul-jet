/**
 * Unit-Tests des Cron-Matchers (Plan 010, Schritt 7).
 */

const { cronMatches, isValidCron } = require('../../src/services/agents/cronMatch');

// Fester Zeitpunkt: Mi, 2026-07-15 09:05 (Wochentag 3).
const D = (m, h = 9, dom = 15, mon = 7) => new Date(2026, mon - 1, dom, h, m, 0);

describe('isValidCron', () => {
  test.each(['* * * * *', '*/5 * * * *', '0 9 * * 1-5', '5 9 15 7 *', '0,30 * * * *'])(
    'gültig: %s',
    e => expect(isValidCron(e)).toBe(true)
  );
  test.each(['', '* * * *', '* * * * * *', 'abc', '60 * * * *', '* 25 * * *', '*/0 * * * *', '*/-1 * * * *'])(
    'ungültig: %s',
    e => expect(isValidCron(e)).toBe(false)
  );
});

describe('cronMatches', () => {
  test('* * * * * matcht immer', () => {
    expect(cronMatches('* * * * *', D(5))).toBe(true);
  });
  test('*/5 matcht Minute 5, nicht Minute 6', () => {
    expect(cronMatches('*/5 * * * *', D(5))).toBe(true);
    expect(cronMatches('*/5 * * * *', D(6))).toBe(false);
  });
  test('exakte Minute+Stunde', () => {
    expect(cronMatches('5 9 * * *', D(5, 9))).toBe(true);
    expect(cronMatches('5 10 * * *', D(5, 9))).toBe(false);
  });
  test('Liste 0,30', () => {
    expect(cronMatches('0,30 * * * *', D(30))).toBe(true);
    expect(cronMatches('0,30 * * * *', D(15))).toBe(false);
  });
  test('Wochentagsbereich 1-5 (Mi=3 passt)', () => {
    expect(cronMatches('0 9 * * 1-5', D(0, 9))).toBe(true);
    expect(cronMatches('0 9 * * 6', D(0, 9))).toBe(false);
  });
  test('dom UND dow eingeschränkt → ODER-Semantik', () => {
    // Tag 15 passt (dom), obwohl dow 0 (So) nicht der Mittwoch ist.
    expect(cronMatches('0 9 15 * 0', D(0, 9))).toBe(true);
    // Weder Tag 20 noch Sonntag → kein Match.
    expect(cronMatches('0 9 20 * 0', D(0, 9))).toBe(false);
  });
  test('ungültiger Ausdruck → false', () => {
    expect(cronMatches('quatsch', D(5))).toBe(false);
  });
});
