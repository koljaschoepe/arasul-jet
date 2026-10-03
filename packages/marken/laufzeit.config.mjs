/**
 * Der Bau der Bibliothek zur Laufzeit: das, was das Geraet unter
 * `/marken/<haupt>/` an jede App ausliefert.
 *
 * Eine App laedt von dort Bausteine, Primitive, Muster, die Tokens und das
 * fertig uebersetzte Stylesheet, statt eine Kopie mitzubringen. Nach einem
 * Update des Geraets steht unter derselben Adresse die neue Fassung, und die
 * App sieht ohne Neubau aus wie das Geraet um sie herum.
 *
 * Was entsteht (Ausgabe `<ziel>/<haupt>/`):
 *
 *   marken.js          alle drei Saetze, dazu `h`, `rendern` und die Hooks
 *   diagramm.js        `Chart`, `Sparkline`, `SERIENFARBEN` (eigener Eingang)
 *   react.js           React, fuer eine App mit eigenem Bau
 *   react-dom.js       React-DOM
 *   react-dom-client.js  `createRoot`, `hydrateRoot`
 *   jsx-runtime.js     `jsx`, `jsxs`, `Fragment` fuer uebersetztes JSX
 *   marken.css         Tokens, Regeln der Bausteine, Klassen der Primitive
 *   marken.json        Fassung, Hauptzahl und jede Datei mit ihrem sha256
 *   ../marken.json     dasselbe ohne Dateiliste, unter `/marken/marken.json`
 *   teil-*.js          gemeinsame Teile mit Hash im Namen (React steckt dort)
 *   pdf-dateien/       Worker, WASM, Schriften fuer die Dokumentanzeige
 *
 * Die festen Namen sind die Adresse, an die eine App sich bindet; sie
 * aendern sich nie innerhalb einer Hauptzahl. Die Teile tragen einen Hash,
 * damit der Browser sie fuer immer behalten darf (Cache-Koepfe in
 * `apps/dashboard-frontend/nginx.conf`).
 *
 * Aufruf (aus `apps/dashboard-frontend/`, damit dessen Vite und Tailwind
 * bauen): `npm run marken:laufzeit`, Ziel `apps/dashboard-frontend/dist/marken`,
 * also neben die Shell, die nginx ausliefert. Der Bau der Shell (`npm run
 * build`) ruft es nach `vite build` mit auf.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pdfDateienBeilegen } from './pdf-dateien.mjs';

const wurzel = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(path.join(wurzel, '../../apps/dashboard-frontend/package.json'));

/** Die Fassung steht an genau einer Stelle: `src/fassung.ts`. */
export function fassungLesen() {
  const text = readFileSync(path.join(wurzel, 'src/fassung.ts'), 'utf8');
  const treffer = text.match(/export const FASSUNG = '(\d+)\.(\d+)\.(\d+)'/);
  if (!treffer) {
    throw new Error('src/fassung.ts nennt keine Fassung');
  }
  return { fassung: `${treffer[1]}.${treffer[2]}.${treffer[3]}`, haupt: treffer[1] };
}

const { fassung, haupt } = fassungLesen();
const ziel = path.join(wurzel, '../../apps/dashboard-frontend/dist/marken', haupt);

/**
 * React ist CommonJS. Ein `export * from 'react'` gaebe nach dem Bau keine
 * benannten Ausgaben her, weil Rollup die Namen eines CommonJS-Moduls nicht
 * sicher lesen kann. Also werden sie hier beim Bau aus dem Modul selbst
 * gelesen und ausdruecklich hingeschrieben.
 */
const REACT_EINGAENGE = {
  'react.js': 'react',
  'react-dom.js': 'react-dom',
  'react-dom-client.js': 'react-dom/client',
  'jsx-runtime.js': 'react/jsx-runtime',
};
const VIRTUELL = '\0marken-laufzeit:';

function reactEingaenge() {
  return {
    name: 'marken:react-eingaenge',
    resolveId(id) {
      return id.startsWith('marken-laufzeit:') ? '\0' + id : null;
    },
    load(id) {
      if (!id.startsWith(VIRTUELL)) return null;
      const modul = id.slice(VIRTUELL.length);
      const namen = Object.keys(require(modul)).filter(
        name => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name)
      );
      return [
        `import Modul from '${modul}';`,
        `export const { ${namen.join(', ')} } = Modul;`,
        'export default Modul;',
      ].join('\n');
    },
  };
}

/** Jede Datei unter `ordner`, relativ und sortiert. */
function dateienUnter(ordner, basis = ordner) {
  return readdirSync(ordner)
    .sort()
    .flatMap(name => {
      const voll = path.join(ordner, name);
      return statSync(voll).isDirectory()
        ? dateienUnter(voll, basis)
        : [path.relative(basis, voll).split(path.sep).join('/')];
    });
}

/**
 * `marken.json` neben die Ausgabe: welche Fassung dort liegt und welche
 * Dateien dazugehoeren. Eine App (oder das Kit) liest daraus, ob die
 * Hauptzahl die ist, auf die sie gebaut wurde.
 */
function stempeln() {
  return {
    name: 'marken:laufzeit-stempel',
    apply: 'build',
    closeBundle: {
      // Nach dem Kopieren der pdf-Dateien, sonst fehlten sie in der Liste.
      order: 'post',
      handler() {
        const dateien = {};
        for (const datei of dateienUnter(ziel)) {
          if (datei === 'marken.json') continue;
          dateien[datei] = createHash('sha256')
            .update(readFileSync(path.join(ziel, datei)))
            .digest('hex');
        }
        const stempel = {
          fassung,
          haupt: Number(haupt),
          adresse: `/marken/${haupt}/`,
          eingaenge: ['marken.js', 'marken.css', 'diagramm.js', ...Object.keys(REACT_EINGAENGE)],
          dateien,
        };
        writeFileSync(path.join(ziel, 'marken.json'), JSON.stringify(stempel, null, 2) + '\n');
        // Und eine Ebene hoeher, ohne Dateiliste: die eine Datei, die nicht
        // an einer Hauptzahl haengt. Wer nicht weiss, welche das Geraet
        // ausliefert (das Kit vor dem Bau), fragt hier.
        const { dateien: _, ...kurz } = stempel;
        writeFileSync(path.join(ziel, '..', 'marken.json'), JSON.stringify(kurz, null, 2) + '\n');
      },
    },
  };
}

export default defineConfig({
  root: wurzel,
  // Die Adresse, unter der die Teile einander finden. Relativ (`./`), damit
  // die Ausgabe unter jeder Hauptzahl gleich funktioniert.
  base: './',
  plugins: [tailwindcss(), react(), reactEingaenge(), pdfDateienBeilegen(() => ziel), stempeln()],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warn',
  build: {
    outDir: ziel,
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    // Kein `modulepreload`-Helfer: er schriebe Pfade relativ zur Seite der
    // App, nicht zu dieser Adresse.
    modulePreload: false,
    rollupOptions: {
      input: {
        marken: path.join(wurzel, 'laufzeit/marken.ts'),
        diagramm: path.join(wurzel, 'laufzeit/diagramm.ts'),
        stil: path.join(wurzel, 'laufzeit/marken.css'),
        ...Object.fromEntries(
          Object.entries(REACT_EINGAENGE).map(([datei, modul]) => [
            datei.replace(/\.js$/, ''),
            'marken-laufzeit:' + modul,
          ])
        ),
      },
      // Die Eingaenge behalten ihre Ausgaben, auch die, die keiner von ihnen
      // selbst benutzt. Sonst verloere `react.js` jeden Namen.
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'teil-[name]-[hash].js',
        assetFileNames: info =>
          (info.names ?? []).includes('stil.css') ? 'marken.css' : 'teil-[name]-[hash][extname]',
      },
    },
  },
});
