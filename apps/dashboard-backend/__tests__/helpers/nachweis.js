/**
 * Ein Nachweis des Kit-Ablaufs, wie ihn das Kit beim `--build` ins Paket
 * schreibt (Formatblatt `.ara/knowledge/nachweis.de.md` des Kits, Schema 1).
 *
 * Mit Absicht EIGENSTAENDIG gerechnet und nicht mit den Bausteinen aus
 * `services/app/appStandard.js`: ein Test, der den Nachweis mit denselben
 * Funktionen bildet, mit denen das Geraet ihn prueft, bestuende auch, wenn
 * beide denselben Fehler haetten. Hier steht das Blatt ein zweites Mal, so
 * wie das Kit es liest (`.ara/tools/lib/nachweis.mjs`, `stampPackage`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = daten => crypto.createHash('sha256').update(daten).digest('hex');

/** Jede regulaere Datei ausser `nachweis.json` in der Wurzel und `node_modules`, sortiert nach Code-Einheiten. */
function dateien(wurzel) {
  const liste = [];
  const gehe = (ordner, tiefe) => {
    for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
      if (e.name.startsWith('._') || e.name === '.DS_Store' || e.name === 'node_modules') continue;
      if (tiefe === 0 && e.isFile() && e.name === 'nachweis.json') continue;
      const voll = path.join(ordner, e.name);
      if (e.isDirectory()) gehe(voll, tiefe + 1);
      else if (e.isFile()) liste.push(path.relative(wurzel, voll).split(path.sep).join('/'));
    }
  };
  gehe(wurzel, 0);
  return liste.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function paketPruefsumme(wurzel) {
  const hash = crypto.createHash('sha256');
  for (const d of dateien(wurzel)) {
    hash.update(`${d}\0${sha(fs.readFileSync(path.join(wurzel, d)))}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

function kanonisch(wert) {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(',')}]`;
  if (wert && typeof wert === 'object') {
    return `{${Object.keys(wert)
      .sort()
      .map(k => `${JSON.stringify(k)}:${kanonisch(wert[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(wert);
}

function siegle(dokument) {
  const { siegel: _weg, ...rest } = dokument;
  return { ...rest, siegel: `sha256:${sha(kanonisch(rest))}` };
}

const QUELLE = `sha256:${'a'.repeat(64)}`;

/**
 * Den Nachweis in einen fertigen Paketordner schreiben. `aendere` bekommt das
 * Dokument VOR dem Siegel und darf es verbiegen, um einen Fall des Blatts zu
 * bauen; `{ siegeln: false }` laesst das Siegel, wie es war.
 */
function stemple(ordner, { aendere = null, siegeln = true } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ordner, 'app.json'), 'utf8'));
  let dokument = {
    schema: 1,
    app: manifest.id,
    version: manifest.version,
    kit: { version: '0.85.0' },
    bibliothek: { marken: manifest.marken ?? null, kopie: null },
    schritte: [
      { name: 'interview', zeit: '2026-11-20T10:50:31.683Z', quelle: QUELLE, plan: 'plan.md' },
      { name: 'bau', zeit: '2026-11-20T10:51:19.008Z', quelle: QUELLE },
      {
        name: 'test',
        zeit: '2026-11-20T10:51:19.274Z',
        quelle: QUELLE,
        vorhanden: true,
        dateien: 1,
        faelle: 6,
        gruen: true,
      },
    ],
    inhalt: { quelle: QUELLE, dateien: 12, paket: paketPruefsumme(ordner) },
    tests: {
      vorhanden: true,
      dateien: 1,
      faelle: 6,
      lauf: { zeit: '2026-11-20T10:51:19.274Z', gruen: true, quelle: QUELLE },
    },
  };
  dokument = siegle(dokument);
  if (aendere) {
    const vorher = dokument.siegel;
    aendere(dokument);
    dokument = siegeln ? siegle(dokument) : { ...dokument, siegel: vorher };
  }
  fs.writeFileSync(path.join(ordner, 'nachweis.json'), `${JSON.stringify(dokument, null, 2)}\n`);
  return dokument;
}

module.exports = { stemple, QUELLE };
