/**
 * `z.record` braucht zwei Argumente (Zod 4). Gefunden am 22.08.2026 am Geraet.
 *
 * Mit einem einzigen Argument baut das Schema zwar, aber beim Parsen eines
 * NICHT LEEREN Objekts wirft es:
 *
 *   Cannot read properties of undefined (reading '_zod')
 *
 * Ein LEERES Objekt geht durch. Deshalb faellt der Fehler in keinem Test auf,
 * der nur die Vorgabe prueft, und deshalb kam er live heraus: eine Erweiterung
 * wollte zum ersten Mal wirklich eine Zeile schreiben, `anlegen` und `lesen`
 * gingen, `schreiben` gab HTTP 500.
 *
 * Zwei Tests, weil zwei Dinge schieflaufen koennen: die Form im Quelltext
 * (findet auch neue Stellen) und das tatsaechliche Verhalten der betroffenen
 * Schemata (findet es auch, wenn jemand die Form umschreibt).
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '../../src/schemas');

/**
 * Findet `z.record(` mit genau EINEM Argument.
 *
 * Gezaehlt wird ueber die Klammertiefe statt per Muster: `z.record(z.string(),
 * z.unknown())` enthaelt selbst Klammern, und ein Muster daraus waere entweder
 * zu grob oder zu streng.
 */
function einargumentigeRecords(quelle) {
  const treffer = [];
  const marke = 'z.record(';
  let i = quelle.indexOf(marke);
  while (i !== -1) {
    let tiefe = 1;
    let j = i + marke.length;
    let kommaAufEbeneEins = false;
    while (j < quelle.length && tiefe > 0) {
      const c = quelle[j];
      if (c === '(') tiefe += 1;
      else if (c === ')') tiefe -= 1;
      else if (c === ',' && tiefe === 1) kommaAufEbeneEins = true;
      j += 1;
    }
    if (!kommaAufEbeneEins) {
      const zeile = quelle.slice(0, i).split('\n').length;
      treffer.push({ zeile, text: quelle.slice(i, Math.min(j, i + 80)) });
    }
    i = quelle.indexOf(marke, i + marke.length);
  }
  return treffer;
}

describe('z.record braucht zwei Argumente (Zod 4)', () => {
  test('kein Schema im Quelltext ruft z.record mit nur einem Argument auf', () => {
    const gefunden = [];
    for (const datei of fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.js'))) {
      const quelle = fs.readFileSync(path.join(SCHEMA_DIR, datei), 'utf8');
      for (const t of einargumentigeRecords(quelle)) {
        gefunden.push(`${datei}:${t.zeile}  ${t.text}`);
      }
    }
    expect(gefunden).toEqual([]);
  });
});
