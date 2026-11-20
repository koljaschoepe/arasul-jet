/**
 * Der Bau des Entwickler-Cockpits (J44, M7): eine App „mit Bau" nach
 * `docs/features/APPS.md` (Bibliothek zur Laufzeit). React und `@marken`
 * bleiben außerhalb des Bündels und kommen vom Gerät unter `/marken/5/`;
 * React gibt es damit genau einmal, das des Geräts.
 *
 * Aufruf aus dem Wurzelordner des Repos:
 *   npx vite build --config apps/entwickler-cockpit/vite.config.ts
 * Ergebnis: `apps/entwickler-cockpit/dist/` mit `app.json` und `frontend/`,
 * so wie das Backend es unter `mitgeliefert/entwickler-cockpit/` erwartet
 * (`apps/dashboard-backend/Dockerfile`, Stufe `cockpit`).
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const MARKEN = '/marken/5/';
const vomGeraet: Record<string, string> = {
  react: MARKEN + 'react.js',
  'react-dom': MARKEN + 'react-dom.js',
  'react-dom/client': MARKEN + 'react-dom-client.js',
  'react/jsx-runtime': MARKEN + 'jsx-runtime.js',
  '@marken': MARKEN + 'marken.js',
};

/** `app.json` neben `frontend/` legen: die Form eines Pakets. */
function manifestBeilegen(): Plugin {
  return {
    name: 'manifest-beilegen',
    closeBundle() {
      mkdirSync(path.join(wurzel, 'dist'), { recursive: true });
      copyFileSync(path.join(wurzel, 'app.json'), path.join(wurzel, 'dist', 'app.json'));
    },
  };
}

/** Ohne `crossorigin`: wie die Shell (selbstsigniertes Zertifikat). */
function ohneCrossorigin(): Plugin {
  return {
    name: 'ohne-crossorigin',
    enforce: 'post',
    transformIndexHtml: html => html.replace(/ crossorigin/g, ''),
  };
}

export default defineConfig({
  root: wurzel,
  base: './',
  plugins: [react(), ohneCrossorigin(), manifestBeilegen()],
  build: {
    outDir: path.join(wurzel, 'dist', 'frontend'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      external: Object.keys(vomGeraet),
      output: { paths: vomGeraet },
    },
  },
});
