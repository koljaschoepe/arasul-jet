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
 *   3. die Bibliothek zur Laufzeit unter `/marken/6/`, wie das Gerät sie
 *      ausliefert (`packages/marken/laufzeit.config.mjs`);
 *   4. die Werkstatt unter `/apps/werkstatt/`;
 *   5. die fünf Fach-Apps unter `/apps/<id>/` und `/apps/<id>/test/`, gebaut
 *      wie eine App aus dem Kit (React und `@marken` vom Gerät).
 *
 * `dist/` (was der Container des Geräts ausliefert) bleibt unberührt.
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

schritt('Bibliothek zur Laufzeit (/marken/6/)');
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

schritt('Fach-Apps (wie eine App aus dem Kit, Bibliothek vom Gerät)');
// React und `@marken` bleiben außerhalb des Bündels und kommen zur Laufzeit
// von `/marken/6/`, wie bei der Werkstatt (`apps/werkstatt/vite.config.ts`).
const MARKEN = '/marken/6/';
const vomGeraet = {
  react: MARKEN + 'react.js',
  'react-dom': MARKEN + 'react-dom.js',
  'react-dom/client': MARKEN + 'react-dom-client.js',
  'react/jsx-runtime': MARKEN + 'jsx-runtime.js',
  '@marken': MARKEN + 'marken.js',
  '@marken/diagramm': MARKEN + 'diagramm.js',
  '@marken/symbole': MARKEN + 'symbole.js',
};
const apps = path.join(demo, 'apps');
const FACH_APPS = [
  'angebote',
  'wareneingang',
  'wartungsplan',
  'pruefprotokolle',
  'urlaub',
  'stammdaten',
];
await esbuild({
  entryPoints: FACH_APPS.map(id => path.join(apps, `${id}.tsx`)),
  outdir: path.join(ziel, 'demo-apps'),
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  plugins: [
    {
      name: 'vom-geraet',
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(react|react-dom|react-dom\/client|react\/jsx-runtime|@marken(\/diagramm|\/symbole)?)$/,
          },
          a => ({
            path: vomGeraet[a.path],
            external: true,
          })
        );
      },
    },
  ],
});
cpSync(path.join(apps, 'app.css'), path.join(ziel, 'demo-apps', 'app.css'));
for (const id of FACH_APPS) {
  const seite = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${id}</title>
    <link rel="stylesheet" href="/marken/6/marken.css" />
    <link rel="stylesheet" href="/demo-apps/app.css" />
  </head>
  <body class="ara-seite">
    <div id="app" data-demo-nicht-uebersetzen></div>
    <script type="module" src="/demo-apps/${id}.js"></script>
  </body>
</html>
`;
  for (const stand of ['', 'test']) {
    const ordner = path.join(ziel, 'apps', id, stand);
    mkdirSync(ordner, { recursive: true });
    writeFileSync(path.join(ordner, 'index.html'), seite);
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

if (!existsSync(path.join(ziel, 'marken/6/marken.js'))) {
  throw new Error('Die Bibliothek fehlt in dist-demo/marken/6/.');
}
schritt(`Fertig: ${path.relative(process.cwd(), ziel) || ziel}`);
