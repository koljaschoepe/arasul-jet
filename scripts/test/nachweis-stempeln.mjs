#!/usr/bin/env node
/**
 * Einen Nachweis des Kit-Ablaufs in den Paketordner einer Abnahme schreiben
 * (J45, M7, 20.11.2026).
 *
 * Seit J45 nimmt das Gerät beim Ausrollen nur ein Paket an, das auf der
 * Bibliothek steht, Tests mitbringt und den Nachweis des Kit-Ablaufs trägt
 * (`nachweis.json`, Formatblatt `.ara/knowledge/nachweis.de.md` im Kit). Die
 * Abnahmen dieses Repos bauen ihre Wegwerf-Pakete von Hand, um eine Funktion
 * des Geräts zu messen, nicht den Ablauf des Kits. Damit sie weiter messen,
 * was sie messen sollen, stempelt dieses Werkzeug den Ordner unmittelbar vor
 * dem Packen:
 *
 *   - nennt `app.json` ein Frontend und keine Fassung der Bibliothek, setzt es
 *     `marken` auf die Hauptzahl des Geräts (`packages/marken/src/fassung.ts`);
 *   - schreibt `nachweis.json` mit den drei Schritten, einem grünen Testlauf
 *     und der Prüfsumme des Pakets, wie es danach gepackt wird.
 *
 * DAS IST KEIN SCHALTER AM GERÄT. Der Nachweis ist kein Fälschungsschutz,
 * wer das Blatt kennt, kann ihn schreiben (Entscheidung 20.11.2026). Eine
 * Abnahme, die die Prüfung SELBST misst (`standard-abnahme.sh`), stempelt
 * nicht oder verbiegt den Stempel mit Absicht.
 *
 *   node scripts/test/nachweis-stempeln.mjs <paketordner>
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ordner = process.argv[2];
if (!ordner) {
  process.stderr.write('Aufruf: nachweis-stempeln.mjs <paketordner>\n');
  process.exit(2);
}

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fassung = /export const FASSUNG = '(\d+)\.\d+\.\d+'/.exec(
  readFileSync(join(WURZEL, 'packages/marken/src/fassung.ts'), 'utf8')
)?.[1];

const manifestPfad = join(ordner, 'app.json');
const manifest = JSON.parse(readFileSync(manifestPfad, 'utf8'));
if (manifest.frontend && !manifest.marken && fassung) {
  manifest.marken = fassung;
  writeFileSync(manifestPfad, `${JSON.stringify(manifest, null, 2)}\n`);
}

const sha = daten => createHash('sha256').update(daten).digest('hex');

function dateien(wurzel) {
  const liste = [];
  const gehe = (dir, tiefe) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('._') || e.name === '.DS_Store' || e.name === 'node_modules') continue;
      if (tiefe === 0 && e.isFile() && e.name === 'nachweis.json') continue;
      const voll = join(dir, e.name);
      if (e.isDirectory()) gehe(voll, tiefe + 1);
      else if (e.isFile()) liste.push(relative(wurzel, voll).split(sep).join('/'));
    }
  };
  gehe(wurzel, 0);
  return liste.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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

const liste = dateien(ordner);
const hash = createHash('sha256');
for (const d of liste) hash.update(`${d}\0${sha(readFileSync(join(ordner, d)))}\n`);
const paket = `sha256:${hash.digest('hex')}`;
// Die Quelle sieht das Gerät nicht; für eine Abnahme steht das Paket dafür.
const quelle = paket;
const zeit = new Date();
const um = ms => new Date(zeit.getTime() + ms).toISOString();

const dokument = {
  schema: 1,
  app: manifest.id,
  version: manifest.version,
  kit: { version: null },
  bibliothek: { marken: manifest.marken ?? null, kopie: null },
  schritte: [
    { name: 'interview', zeit: um(0), quelle, plan: 'abnahme' },
    { name: 'bau', zeit: um(1), quelle },
    { name: 'test', zeit: um(2), quelle, vorhanden: true, dateien: 1, faelle: 1, gruen: true },
  ],
  inhalt: { quelle, dateien: liste.length, paket },
  tests: { vorhanden: true, dateien: 1, faelle: 1, lauf: { zeit: um(2), gruen: true, quelle } },
};
dokument.siegel = `sha256:${sha(kanonisch(dokument))}`;
writeFileSync(join(ordner, 'nachweis.json'), `${JSON.stringify(dokument, null, 2)}\n`);
