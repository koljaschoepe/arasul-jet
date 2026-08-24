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

  test('die betroffenen Bruecken-Schemata nehmen ein GEFUELLTES Objekt an', () => {
    const s = require('../../src/schemas/extensions');
    const faelle = [
      ['BrueckeTabellenBody', { aktion: 'schreiben', name: 'abgleiche', werte: { kunde: 'x' } }],
      ['BrueckeTabellenBody', { aktion: 'lesen', name: 'abgleiche', wo: { kunde: 'x' } }],
      ['BrueckeZeitplanBody', { aktion: 'anlegen', flow: 'f', uhrzeit: '03:00', args: { a: '1' } }],
      ['BrueckeFlowRunBody', { args: { a: 1 } }],
      ['BrueckeNetzBody', { url: 'https://example.com/', kopf: { 'x-test': 'ja' } }],
    ];
    for (const [name, wert] of faelle) {
      expect(() => s[name].parse(wert)).not.toThrow();
    }
  });

  test('ein gefuelltes Objekt wird auch inhaltlich geprueft', () => {
    // Frueher stand hier ein Test, der das kaputte Schema selbst nachbaute und
    // den Absturz erwartete (`toThrow(/_zod/)`). Er hat seinen Zweck erfuellt
    // und ist am 24.08.2026 abgelaufen: zod 4.4.3 nimmt `z.record` mit einem
    // Argument an, und zwar mit derselben Bedeutung wie mit zweien. Am
    // Wegwerf-Projekt nachgemessen, beide Formen gegeneinander:
    //
    //   ein Argument     {"a":"text"}   akzeptiert
    //   ein Argument     {"a":42}       abgelehnt
    //   zwei Argumente   {"a":"text"}   akzeptiert
    //   zwei Argumente   {"a":42}       abgelehnt
    //
    // Ein Test, der einen behobenen Fehler festhaelt, blockiert nur noch das
    // Update, das ihn behoben hat. Was bleibt, ist das eigentliche Ziel: ein
    // GEFUELLTES Objekt muss ankommen UND inhaltlich geprueft werden. Ein
    // leeres allein haette den urspruenglichen Fehler nie gezeigt, deshalb
    // steht hier beides.
    const s = require('../../src/schemas/extensions');
    expect(() => s.BrueckeNetzBody.parse({ url: 'https://example.com/', kopf: {} })).not.toThrow();
    expect(() => s.BrueckeNetzBody.parse({ url: 'https://example.com/', kopf: { 'x-a': 'b' } })).not.toThrow();
    expect(() => s.BrueckeNetzBody.parse({ url: 'https://example.com/', kopf: { 'x-a': 42 } })).toThrow();
  });
});
