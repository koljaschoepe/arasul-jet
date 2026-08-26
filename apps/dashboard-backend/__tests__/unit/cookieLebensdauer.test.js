/**
 * Das Sitzungs-Cookie gilt genau so lange wie der Token (23.08.2026).
 *
 * An sechs Stellen in `routes/auth.js` stand fest `4 * 60 * 60 * 1000`, mit
 * dem Kommentar "matches JWT_EXPIRY". Auf dem Orin steht `JWT_EXPIRY=24h`.
 *
 * Die Folge war leise und darum unangenehm: nach vier Stunden lief die
 * Anwendung weiter, weil sie den Token aus dem Speicher als `Authorization`
 * schickt. Nur der eingebettete Rahmen brach mit 401 — ein iframe kann keinen Kopf
 * setzen, es hat nur das Cookie. Der Nutzer sah eine leere Flaeche ohne
 * Erklaerung, und nichts wies auf die abgelaufene Sitzung hin.
 *
 * Gefunden hat es die Oberflaechen-Abnahme, die alle sechs Ansichten oeffnet.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const fs = require('fs');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { tokenLebensdauerMs } = require('../../src/utils/jwt');

describe('tokenLebensdauerMs', () => {
  it.each([
    ['24h', 24 * 3600 * 1000],
    ['4h', 4 * 3600 * 1000],
    ['30m', 30 * 60 * 1000],
    ['7d', 7 * 86400 * 1000],
    ['45s', 45 * 1000],
    [3600, 3600 * 1000],
  ])('liest %s', (wert, erwartet) => {
    expect(tokenLebensdauerMs(wert)).toBe(erwartet);
  });

  it.each([['bald'], [''], [null], ['0h'], ['-5h']])(
    'faellt bei %s auf vier Stunden zurueck',
    wert => {
      expect(tokenLebensdauerMs(wert)).toBe(4 * 3600 * 1000);
    }
  );

  it('ohne Argument gilt die konfigurierte Dauer, nicht der Rueckfall', () => {
    // `undefined` ist KEIN ungueltiger Wert: es heisst "nimm JWT_EXPIRY".
    // Genau deshalb steht es nicht in der Liste oben.
    const konfiguriert = process.env.JWT_EXPIRY || '4h';
    expect(tokenLebensdauerMs()).toBe(tokenLebensdauerMs(konfiguriert));
  });
});

describe('routes/auth.js', () => {
  const quelle = fs.readFileSync(path.join(__dirname, '../../src/routes/auth.js'), 'utf8');

  it('setzt keine feste Cookie-Lebensdauer mehr', () => {
    // Der Test prueft die QUELLE, weil eine falsche Zahl erst nach Stunden
    // auffaellt — und dann an einer Stelle, die niemand mit dem Cookie in
    // Verbindung bringt.
    expect(quelle).not.toMatch(/maxAge:\s*\d+\s*\*/);
  });

  it('jedes gesetzte Cookie nimmt die Token-Lebensdauer', () => {
    const maxAges = quelle.match(/maxAge:\s*[^,\n]+/g) || [];
    expect(maxAges.length).toBeGreaterThan(3);
    for (const zeile of maxAges) {
      expect(zeile).toContain('tokenLebensdauerMs()');
    }
  });
});
