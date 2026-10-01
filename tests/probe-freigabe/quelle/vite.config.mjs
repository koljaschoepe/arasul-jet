// Der Bau der Proben-App (J36): ein frisches Vite-Projekt, das die Bibliothek
// so benutzt, wie eine App sie benutzt -- als Quelle, mit Alias, ohne Paket.
// Gebaut wird von `scripts/test/freigabe-wer-entscheidet-abnahme.sh` in den
// Paketordner; `base: './'`, weil die App unter /apps/<id>/ liegt.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const hier = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: hier,
  base: './',
  plugins: [
    tailwindcss(),
    react(),
    {
      // Selbstsigniertes Zertifikat plus `crossorigin` heisst: Chrome sperrt das
      // Modulskript wortlos. Die Shell streicht das Attribut aus demselben Grund.
      name: 'ohne-crossorigin',
      enforce: 'post',
      transformIndexHtml: html => html.replace(/ crossorigin/g, ''),
    },
  ],
  resolve: { alias: { '@marken': path.resolve(hier, '../../../packages/marken/src') } },
  build: { outDir: process.env.PROBE_AUSGABE || path.resolve(hier, 'dist'), emptyOutDir: true },
});
