import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Remove 'crossorigin' from <script> and <link> tags in built HTML.
 * Self-signed TLS certificates + crossorigin attribute = Chrome silently
 * blocks module scripts (CORS mode + untrusted cert).
 */
function removeCrossOrigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), removeCrossOrigin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // No manualChunks — Vite's automatic splitting avoids circular
    // dependency TDZ errors that manual splitting caused.
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
    // Die Zeitzone gehoert zur Messung, nicht zur Maschine (28.08.2026).
    // `formatDate` schreibt einen Zeitpunkt in Ortszeit; ohne feste Zone misst
    // derselbe Test auf dem Laptop (Europe/Berlin) und in der CI (UTC) zwei
    // verschiedene Uhrzeiten. Genau daran ist die Sicherungs-Reihe im Lauf
    // 33163888736 gescheitert: „27.08.2026, 04:00" hier, „02:00" dort.
    // Gewaehlt ist die Zone des Geraets, nicht UTC — ein Test soll zeigen, was
    // der Mensch vor dem Bildschirm sieht. Die Sprache steht ohnehin in jedem
    // Aufruf (`toLocaleString('de-DE')`) und haengt an keiner Umgebung.
    env: { TZ: 'Europe/Berlin' },
  },
});
