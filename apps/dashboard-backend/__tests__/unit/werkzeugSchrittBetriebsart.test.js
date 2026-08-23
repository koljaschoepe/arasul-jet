/**
 * Ein Werkzeug-Schritt sieht die Betriebsart des Flusses (Plan 023 I3).
 *
 * `buildTools` laesst `frage_nutzer` in der Betriebsart `autonom` absichtlich
 * weg, und zwar gar nicht erst als gesperrte Variante: ein Modell, das ein
 * Werkzeug sieht, benutzt es irgendwann.
 *
 * Der deterministische Schritt-Pfad rief `makeTools([werkzeug])` OHNE die
 * Betriebsart auf. Die Vorgabe ist `autonom`, also fiel `frage_nutzer` heraus,
 * und ein Schritt mit diesem Werkzeug scheiterte IMMER, auch in einem Flow mit
 * `betriebsart: rueckfragen`. Am 23.08.2026 auf dem Orin gemessen:
 *
 *   Schritt "umfang" fehlgeschlagen:
 *   Werkzeug "frage_nutzer" ist nicht verfuegbar
 *
 * Damit war die Rueckfrage im deklarierten Schritt unerreichbar, also genau der
 * Weg, den das `angebot`-Beispiel geht. Der modellgetriebene Pfad reichte die
 * Betriebsart laengst durch; nur dieser eine Aufruf nicht.
 *
 * Geprueft wird deshalb der Aufruf im Quelltext und das Verhalten von
 * `buildTools`. Der ganze Lauf laesst sich hier nicht nachstellen, ohne halb
 * Arasul zu ersetzen, und ein Test, der dafuer zwanzig Attrappen baut, prueft
 * am Ende die Attrappen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const fs = require('fs');
const path = require('path');
const { buildTools } = require('../../src/services/flows/toolRegistry');

describe('frage_nutzer im deklarierten Schritt (Plan 023 I3)', () => {
  test('buildTools gibt frage_nutzer nur mit betriebsart rueckfragen heraus', () => {
    const ohne = buildTools(['frage_nutzer']).map(t => t.name);
    expect(ohne).not.toContain('frage_nutzer');

    const autonom = buildTools(['frage_nutzer'], { betriebsart: 'autonom' }).map(t => t.name);
    expect(autonom).not.toContain('frage_nutzer');

    const mit = buildTools(['frage_nutzer'], { betriebsart: 'rueckfragen' }).map(t => t.name);
    expect(mit).toContain('frage_nutzer');
  });

  test('der Werkzeug-Schritt reicht die Betriebsart durch', () => {
    // Aus dem Quelltext, weil der Aufruf tief in `runFlow` steckt: ein
    // `makeTools([...])` OHNE zweites Argument ist genau der Fehler, der
    // `frage_nutzer` im Schritt unerreichbar machte.
    const quelle = fs.readFileSync(
      path.join(__dirname, '../../src/services/flows/runFlow.js'),
      'utf8'
    );
    const aufrufe = [...quelle.matchAll(/makeTools\(([^)]*)\)/g)].map(m => m[1]);
    expect(aufrufe.length).toBeGreaterThan(1);
    const ohneBetriebsart = aufrufe.filter(
      a => !/betriebsart/.test(a) && !/^\s*\[\s*\]\s*$/.test(a)
    );
    expect(ohneBetriebsart).toEqual([]);
  });
});
