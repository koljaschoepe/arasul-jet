import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Die Stuetzdateien der Dokumentanzeige (Worker, WASM, Schriften) muessen
// neben den Chunks liegen -- die Bibliothek loest sie zur Laufzeit relativ
// zu `import.meta.url` auf. EIN Kopierschritt fuer Buendel und Shell,
// Begruendung im Plugin selbst.
import { pdfDateienBeilegen } from '../../packages/marken/pdf-dateien.mjs';

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
  plugins: [
    tailwindcss(),
    react(),
    removeCrossOrigin(),
    // Die Chunks liegen unter `dist/assets/`, also gehoert `pdf-dateien/`
    // dorthin: `new URL('pdf-dateien/…', import.meta.url)` zeigt aus jedem
    // Chunk auf `/assets/pdf-dateien/…`.
    pdfDateienBeilegen(() => path.resolve(__dirname, 'dist/assets')),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Das Designsystem (Phase D7). Ein PFAD-Alias wie `@` und kein
      // npm-Paket: die Bibliothek wird mit der Shell uebersetzt, steht in
      // keinem Lockfile und hat kein `dist/`, das jemand vergessen koennte.
      // Dieselbe Quelle nimmt eine App -- als Buendel unter
      // `packages/marken/browser/` oder ueber den Spiegel des Kits.
      '@marken': path.resolve(__dirname, '../../packages/marken/src'),
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
    // Weiterhin KEIN `manualChunks`: Vites selbsttaetige Aufteilung vermeidet
    // die TDZ-Fehler aus Ringschluessen, die eine Aufteilung von Hand einmal
    // gebracht hat. Was hier steht, ist etwas anderes -- eine Auskunft ueber
    // die Bibliothek, keine Zuordnung von Code zu Buendeln.
    rollupOptions: {
      treeshake: {
        /**
         * DIE BIBLIOTHEK HAT KEINE SEITENEFFEKTE (Phase H5).
         *
         * Jede Datei unter `packages/marken/src` ist eine reine Deklaration:
         * eine Komponente, ein Typ, eine Funktion. Keine registriert etwas
         * beim Laden, keine wird um ihrer Wirkung willen importiert. Rollup
         * kann das nicht von selbst wissen -- die uebliche Auskunft dafuer
         * ist `"sideEffects": false` in einer `package.json`, und die hat die
         * Bibliothek mit Absicht nicht: sie ist ein PFAD-ALIAS und kein
         * npm-Paket (`resolve.alias` oben, Regel 7 der Wurzel-`CLAUDE.md`).
         * Ohne die Auskunft nimmt Rollup Seiteneffekte an und behaelt jedes
         * Modul, das ueber das Barrel `@marken` erreichbar ist.
         *
         * WAS DAS GEKOSTET HAT. `App.tsx`, `Login`, `ErrorBoundary` und vier
         * weitere Dateien werden NICHT nachgeladen, sondern stehen im
         * Einstieg -- und jede von ihnen holt etwas aus `@marken`. Damit lag
         * seit H4 der ganze Satz von sechsundvierzig Primitiven im ersten
         * Buendel, mitsamt `recharts`, `cmdk`, `react-day-picker`,
         * `embla-carousel` und `input-otp`. Am fertigen Bau gemessen (gzip,
         * `index.html` plus alles, was es als `modulepreload` nennt):
         *
         *     H3 (3447ec19)   208,20 kB
         *     H4 (e1359afd)   388,95 kB      +180,75
         *     H5 mit dieser Zeile  161,77 kB   -227,18 gegen H4,
         *                                      -46,43 gegen H3
         *
         * Es war also nie etwas dazugekommen, was ein Mensch beim Anmelden
         * braucht -- es war von „spaeter" nach „sofort" gerutscht. Der
         * Kalender, das Karussell und die Suchliste liegen jetzt wieder in
         * dem Buendel, das sie benutzt.
         *
         * `.css` bleibt ausgenommen: ein Stylesheet IST sein Seiteneffekt.
         */
        moduleSideEffects: (id: string) =>
          !id.includes('/packages/marken/src/') || id.endsWith('.css'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    // Die Bibliothek liegt NEBEN diesem Projekt und bringt seit H3 ihre
    // eigenen Tests mit (Primitive, `cn`). Ohne diese Zeile sucht Vitest nur
    // unterhalb der Vite-Wurzel und liefe gruen ueber Tests, die es gar nicht
    // eingesammelt hat.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../../packages/marken/src/**/*.{test,spec}.{ts,tsx}',
    ],
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
