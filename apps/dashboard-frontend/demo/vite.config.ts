/**
 * Der Bau der Demo (J46, M7): dasselbe Frontend, ein anderer Eingang.
 *
 * Die Wurzel bleibt `apps/dashboard-frontend`, damit Tailwind dieselben
 * Quellen findet wie beim Bau des Produkts (es sucht ab der Vite-Wurzel).
 * Eingang ist `demo/index.html` statt `index.html`; ausgegeben wird nach
 * `dist-demo/`, nie nach `dist/`, das der Container des Geräts ausliefert.
 * Aufruf: `npm run demo:bauen` (`demo/bauen.mjs`), nicht direkt.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import produkt from '../vite.config';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basis = produkt as UserConfig;

export default mergeConfig(
  {
    ...basis,
    // Die Stützdateien der Dokumentanzeige legt das Plugin des Produkts nach
    // `dist/assets`; die Demo braucht sie nicht und fasst `dist/` nicht an.
    plugins: (basis.plugins ?? []).filter(
      p => !(p && typeof p === 'object' && 'name' in p && /pdf/i.test(String(p.name)))
    ),
    test: undefined,
    server: undefined,
  },
  defineConfig({
    root: frontend,
    build: {
      outDir: path.join(frontend, 'dist-demo'),
      emptyOutDir: true,
      rollupOptions: { input: path.join(frontend, 'demo/index.html') },
    },
  })
);
