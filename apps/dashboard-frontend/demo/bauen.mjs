/**
 * Baut die Demo (J46, M7) nach `apps/dashboard-frontend/dist-demo/`: ein
 * statischer Ordner, den jeder Hoster für statische Seiten ausliefert.
 *
 *   npm run demo:bauen            (im Ordner apps/dashboard-frontend)
 *
 * Fünf Teile, alle aus diesem Repo, nichts aus dem Netz:
 *   1. das echte Frontend mit dem Eingang `demo/index.html` (Vite);
 *   2. der Service Worker mit den gespielten Antworten (`demo/dienst.ts`,
 *      esbuild als IIFE nach `/demo-dienst.js`);
 *   3. die Bibliothek zur Laufzeit unter `/marken/5/`, wie das Gerät sie
 *      ausliefert (`packages/marken/laufzeit.config.mjs`);
 *   4. die Werkstatt unter `/apps/werkstatt/`;
 *   5. die drei Beispiel-Apps unter `/apps/<id>/` und `/apps/<id>/test/`.
 *
 * `dist/` (was der Container des Geräts ausliefert) bleibt unberührt.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { build as esbuild } from 'esbuild';

const demo = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(demo, '..');
const repo = path.resolve(frontend, '../..');
const ziel = path.join(frontend, 'dist-demo');

const schritt = text => process.stdout.write(`\n▸ ${text}\n`);

schritt('Frontend mit dem Eingang der Demo');
await build({ configFile: path.join(demo, 'vite.config.ts'), logLevel: 'warn' });
renameSync(path.join(ziel, 'demo', 'index.html'), path.join(ziel, 'index.html'));
rmSync(path.join(ziel, 'demo'), { recursive: true, force: true });

schritt('Service Worker');
await esbuild({
  entryPoints: [path.join(demo, 'dienst.ts')],
  outfile: path.join(ziel, 'demo-dienst.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});

schritt('Bibliothek zur Laufzeit (/marken/5/)');
process.env.MARKEN_LAUFZEIT_ZIEL = path.join(ziel, 'marken');
await build({
  configFile: path.join(repo, 'packages/marken/laufzeit.config.mjs'),
  logLevel: 'warn',
});
delete process.env.MARKEN_LAUFZEIT_ZIEL;

schritt('Werkstatt');
const werkstatt = path.join(repo, 'apps/werkstatt');
await build({ configFile: path.join(werkstatt, 'vite.config.ts'), logLevel: 'warn' });
cpSync(path.join(werkstatt, 'dist/frontend'), path.join(ziel, 'apps/werkstatt'), {
  recursive: true,
});

schritt('Beispiel-Apps');
const apps = path.join(demo, 'apps');
mkdirSync(path.join(ziel, 'demo-apps'), { recursive: true });
for (const eintrag of readdirSync(apps, { withFileTypes: true })) {
  if (eintrag.isFile() && eintrag.name.endsWith('.js')) {
    cpSync(path.join(apps, eintrag.name), path.join(ziel, 'demo-apps', eintrag.name));
  } else if (eintrag.isDirectory()) {
    const seite = path.join(apps, eintrag.name, 'index.html');
    for (const stand of ['', 'test']) {
      const ordner = path.join(ziel, 'apps', eintrag.name, stand);
      mkdirSync(ordner, { recursive: true });
      cpSync(seite, path.join(ordner, 'index.html'));
    }
  }
}

schritt('Auslieferung (vercel.json)');
// Keine fremde Herkunft, nirgends: die CSP sagt es dem Browser, und die
// Abnahme misst es (`demo/abnahme.mjs`).
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');
writeFileSync(
  path.join(ziel, 'vercel.json'),
  JSON.stringify(
    {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      rewrites: [
        { source: '/workspace', destination: '/index.html' },
        { source: '/workspace/:pfad*', destination: '/index.html' },
      ],
      headers: [
        {
          source: '/(.*)',
          headers: [
            { key: 'Content-Security-Policy', value: csp },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'no-referrer' },
            { key: 'X-Robots-Tag', value: 'noindex' },
          ],
        },
        {
          source: '/demo-dienst.js',
          headers: [{ key: 'Cache-Control', value: 'no-cache' }],
        },
      ],
    },
    null,
    2
  ) + '\n'
);

if (!existsSync(path.join(ziel, 'marken/5/marken.js'))) {
  throw new Error('Die Bibliothek fehlt in dist-demo/marken/5/.');
}
schritt(`Fertig: ${path.relative(process.cwd(), ziel) || ziel}`);
