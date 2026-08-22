/**
 * Plan 023 H1: jede Brücken-Route hat ihre Fähigkeit in der erlaubten Liste.
 *
 * `BRUECKE_FAEHIGKEITEN` ist das Nadelöhr. Eine Fähigkeit, die dort fehlt, ist
 * nicht deklarierbar: `validiereManifest` weist das Manifest ab, und die
 * Erweiterung wird gar nicht erst registriert.
 *
 * Genau das ist am 22.08.2026 passiert. `netz`, `tabellen` und `zeitplan`
 * bekamen ihre Routen, ihre Dienste und ihre Tests — und niemand konnte sie
 * deklarieren, weil die Liste vier Einträge lang blieb. Alle Tests waren grün.
 *
 * Dieser Test vergleicht deshalb die Routen mit der Liste, statt die Liste
 * gegen sich selbst zu prüfen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const fs = require('fs');
const path = require('path');
const { BRUECKE_FAEHIGKEITEN } = require('../../src/services/extensions/extensionPackage');

/** Alle Fähigkeiten, die `routes/extensions.js` beim Autorisieren verlangt. */
function faehigkeitenAusRouten() {
  const quelle = fs.readFileSync(
    path.join(__dirname, '../../src/routes/extensions.js'),
    'utf8'
  );
  // Die Aufrufe stehen mal in einer, mal in vier Zeilen, und der zweite
  // Parameter ist selbst ein Aufruf (`bearerFrom(req)`). Deshalb ab
  // `autorisieren(` bis zum naechsten Zeichenketten-Argument suchen.
  const treffer = [...quelle.matchAll(/autorisieren\([\s\S]{0,160}?'([a-z]+)'/g)];
  return [...new Set(treffer.map(m => m[1]))];
}

describe('Brücken-Fähigkeiten (Plan 023 H1)', () => {
  test('jede Route verlangt eine Fähigkeit, die deklarierbar ist', () => {
    const ausRouten = faehigkeitenAusRouten();
    expect(ausRouten.length).toBeGreaterThan(3);
    const fehlend = ausRouten.filter(f => !BRUECKE_FAEHIGKEITEN.includes(f));
    expect(fehlend).toEqual([]);
  });

  test('die drei neuen sind dabei', () => {
    // Damit ein Umbau, der die Routen umschreibt, nicht still alle drei
    // gleichzeitig verliert und der Test oben trotzdem gruen bleibt.
    for (const f of ['netz', 'tabellen', 'zeitplan']) {
      expect(BRUECKE_FAEHIGKEITEN).toContain(f);
    }
  });

  test('keine Fähigkeit ohne Route', () => {
    // Die andere Richtung: was deklarierbar ist, muss auch irgendwo greifen.
    // Sonst gibt eine Erweiterung eine Fähigkeit frei, die nichts bewirkt.
    const ausRouten = new Set(faehigkeitenAusRouten());
    const ohneRoute = BRUECKE_FAEHIGKEITEN.filter(f => !ausRouten.has(f));
    expect(ohneRoute).toEqual([]);
  });
});

/**
 * Dieselbe Klasse Fehler, ein Stockwerk tiefer (22.08.2026, zweiter Fund).
 *
 * `BrueckeTabellenBody` und `BrueckeZeitplanBody` standen in
 * `schemas/extensions.js`, wurden aber nicht exportiert. `validateBody(undefined)`
 * wirft beim ersten Aufruf, und beide Routen antworteten mit HTTP 500
 * "Internal server error" — nicht seit einem Fehler, sondern seit dem ersten
 * Tag. Am Geraet nachgemessen:
 *
 *   POST /api/extensions/beispiel-drei/bruecke/tabellen -> 500
 *   Log: Cannot read properties of undefined (reading 'safeParse')
 *
 * Alle Tests waren gruen, weil sie die DIENSTE pruefen, nicht die Verdrahtung
 * der Route. Deshalb vergleicht dieser Test jeden `validateBody(...)`-Aufruf in
 * der Routen-Datei mit dem, was das Schema-Modul wirklich hergibt.
 */
describe('Brücken-Schemata (Plan 023 H1)', () => {
  const schemata = require('../../src/schemas/extensions');

  /** Alle Namen, die `routes/extensions.js` an validateBody/Params/Query gibt. */
  function schemaNamenAusRouten() {
    const quelle = fs.readFileSync(path.join(__dirname, '../../src/routes/extensions.js'), 'utf8');
    const treffer = [...quelle.matchAll(/validate(?:Body|Params|Query)\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g)];
    return [...new Set(treffer.map(m => m[1]))];
  }

  test('jedes Schema, das eine Route benutzt, wird auch exportiert', () => {
    const benutzt = schemaNamenAusRouten();
    expect(benutzt.length).toBeGreaterThan(3);
    const fehlend = benutzt.filter(n => typeof schemata[n]?.safeParse !== 'function');
    expect(fehlend).toEqual([]);
  });

  test('die beiden, die es getroffen hat, sind da', () => {
    expect(typeof schemata.BrueckeTabellenBody?.safeParse).toBe('function');
    expect(typeof schemata.BrueckeZeitplanBody?.safeParse).toBe('function');
  });
});
