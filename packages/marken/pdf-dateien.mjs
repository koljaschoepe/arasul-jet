/**
 * Die Stuetzdateien von pdf.js neben das uebersetzte JavaScript legen
 * (Auftrag bibliothek-dokumentanzeige, 31.08.2026).
 *
 * Die `Dokumentanzeige` loest Worker, WASM, Standardschriften, CMaps und
 * ICC-Profile zur Laufzeit relativ zu `import.meta.url` auf -- absichtlich
 * OHNE Vite-Asset-Import, denn im Bibliotheks-Bau bettet Vite jedes Asset
 * als data:-URI ein, und einen data:-Worker laesst die CSP des Geraets nicht
 * zu (`script-src 'self'`). Also muss JEDER Bau, der die Bibliothek
 * uebersetzt, den Ordner `pdf-dateien/` neben seine Ausgabe legen:
 *
 *   das Buendel   `packages/marken/vite.config.mjs` -> `browser/pdf-dateien/`
 *                 (eingecheckt, `npm run marken` erneuert es)
 *   die Shell     `apps/dashboard-frontend/vite.config.ts` ->
 *                 `dist/assets/pdf-dateien/` (die Chunks liegen unter
 *                 `assets/`, also zeigt `import.meta.url` dorthin)
 *   eine App      mit Bau (Vorlage des Ara-Kits) genauso -- siehe
 *                 `EINBAU.md`; ohne Bau bekommt sie den Ordner von
 *                 `scripts/util/marken-beilegen.sh` neben `marken.js` gelegt.
 *
 * EIN Plugin fuer alle, denn zwei Kopierschritte, die auseinanderlaufen,
 * waeren ein Betrachter, der nur in einem der beiden Baue Worker und
 * Schriften findet -- und das faellt erst am Geraet auf.
 *
 * DER WORKER HEISST `.js`, NICHT `.mjs`: nginx im Frontend-Container kennt
 * fuer `.mjs` keinen JavaScript-MIME-Typ, und ein Module-Worker mit
 * `application/octet-stream` wird vom Browser wortlos verworfen.
 */
import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Kopiert die Stuetzdateien nach `<ziel>/pdf-dateien/`.
 * @param {string} ziel  Ordner, in dem das uebersetzte JavaScript liegt.
 */
export function pdfDateienKopieren(ziel) {
  const quelle = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const ordner = path.join(ziel, 'pdf-dateien');
  rmSync(ordner, { recursive: true, force: true });
  mkdirSync(ordner, { recursive: true });
  copyFileSync(
    path.join(quelle, 'build', 'pdf.worker.min.mjs'),
    path.join(ordner, 'pdf.worker.min.js')
  );
  for (const teil of ['wasm', 'standard_fonts', 'cmaps', 'iccs']) {
    cpSync(path.join(quelle, teil), path.join(ordner, teil), { recursive: true });
  }
}

/**
 * Das Vite-Plugin dazu: kopiert nach dem Bau in das genannte Verzeichnis.
 * @param {() => string} zielOrdner  wird erst nach dem Bau gefragt.
 * @returns {import('vite').Plugin}
 */
export function pdfDateienBeilegen(zielOrdner) {
  return {
    name: 'marken:pdf-dateien-beilegen',
    apply: 'build',
    closeBundle() {
      pdfDateienKopieren(zielOrdner());
    },
  };
}
