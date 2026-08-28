/**
 * Der Bau des Buendels fuer Apps ohne eigenen Buendler (Phase D7).
 *
 * Eine Datei, und React liegt darin: `browser/marken.js`. Sie ist eingecheckt
 * -- wie `packages/shared-schemas/dist/` und aus demselben Grund. Auf dem
 * Geraet gibt es kein `npm install` und keinen Bau, und `beispielapp.sh` legt
 * die Datei beim Einspielen einfach neben die App.
 *
 * Das Stylesheet wird hier NICHT mitgebaut: `src/marken.css` ist schon die
 * fertige Datei, und eine zweite Kopie davon waere eine zweite Wahrheit. Wer
 * eine App einspielt, kopiert sie daneben.
 *
 * Aufruf aus dem Wurzelverzeichnis:  npm run marken
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Ohne diese Zeile waere die Wurzel das Verzeichnis, aus dem der Aufruf
  // kommt -- und der kommt aus `apps/dashboard-frontend/`, damit dessen Vite
  // baut und nicht ein zweites aus dem Wurzel-`node_modules`.
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  // React liest `process.env.NODE_ENV`, und im Browser gibt es kein `process`.
  // Ohne diese Zeile wirft das Buendel beim ersten Rendern.
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'browser',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    // Kein `external`: React GEHOERT in dieses Buendel, das ist sein Zweck.
    lib: {
      entry: 'src/browser.ts',
      formats: ['es'],
      fileName: () => 'marken.js',
    },
  },
});
