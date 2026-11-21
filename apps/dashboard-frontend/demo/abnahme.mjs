/**
 * Die Abnahme der Demo (J46, M7) am fertigen Bau `dist-demo/`.
 *
 *   npm run demo:bauen && node demo/abnahme.mjs [--bilder <ordner>] [--sammeln]
 *   ARASUL_DEMO_URL=https://… node demo/abnahme.mjs   (gegen die Auslieferung)
 *
 * Ohne Adresse startet sie einen kleinen Server für `dist-demo/`, der die
 * Regeln aus `vercel.json` nachspielt (Umschreibungen, Köpfe). Dann geht sie
 * den Weg der Website durch, je Sprache und Breite (390, 768, 1440 px):
 *
 *   Startseite als Mitarbeiter → App „Angebote" → Rückmeldung mit Foto und
 *   Markierung → auf Entwickler umschalten → Cockpit: die Meldung im Eingang
 *   → „Test nach Live": Angebote 1.5.0 live → die App rechnet mit Rabatt.
 *
 * Gemessen wird: jeder Schritt sichtbar, kein waagrechter Überlauf (Shell und
 * App im Rahmen), keine Anfrage an eine fremde Herkunft, keine Anfrage an
 * `/api/…`, die den Server erreicht (der Service Worker beantwortet alle),
 * kein Fehler in der Konsole. `--sammeln` gibt stattdessen die deutschen
 * Sätze aus, die das englische Wörterbuch braucht.
 *
 * Playwright steht nicht im Lockfile: `ARASUL_PLAYWRIGHT=<Ordner mit
 * node_modules/playwright>` oder `npm i --no-save playwright`.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function ladePlaywright() {
  try {
    return await import('playwright');
  } catch {
    const ort = process.env.ARASUL_PLAYWRIGHT;
    if (!ort) {
      console.log(
        'ROT    playwright fehlt: ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>.'
      );
      process.exit(1);
    }
    return createRequire(path.join(ort, 'x.js'))('playwright');
  }
}

const demo = path.dirname(fileURLToPath(import.meta.url));
const bau = path.resolve(demo, '../dist-demo');
const args = process.argv.slice(2);
const SAMMELN = args.includes('--sammeln');
const bilderArg = args.indexOf('--bilder');
const BILDER = bilderArg >= 0 ? path.resolve(args[bilderArg + 1]) : null;
const BREITEN = [390, 768, 1440];
const spracheArg = args.indexOf('--sprache');
const SPRACHEN = spracheArg >= 0 ? [args[spracheArg + 1]] : SAMMELN ? ['de'] : ['de', 'en'];

const befunde = [];
const rot = text => {
  befunde.push(text);
  console.log(`ROT    ${text}`);
};
const gruen = text => console.log(`GRÜN   ${text}`);

// ── Der Server für dist-demo/, mit den Regeln aus vercel.json ──────────────
const apiTreffer = [];
const alleAnfragen = [];
const protokollArg = args.indexOf('--protokoll');
const PROTOKOLL = protokollArg >= 0 ? path.resolve(args[protokollArg + 1]) : null;
function server() {
  const regeln = JSON.parse(readFileSync(path.join(bau, 'vercel.json'), 'utf8'));
  const koepfe = Object.fromEntries(
    regeln.headers.find(x => x.source === '/(.*)').headers.map(k => [k.key, k.value])
  );
  const typen = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
  };
  return createServer((req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pfad.startsWith('/api/') || /\/api\//.test(pfad)) apiTreffer.push(pfad);
    let datei = path.join(bau, pfad);
    if (pfad === '/workspace' || pfad.startsWith('/workspace/'))
      datei = path.join(bau, 'index.html');
    else if (existsSync(datei) && statSync(datei).isDirectory())
      datei = path.join(datei, 'index.html');
    if (!datei.startsWith(bau) || !existsSync(datei)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
      return;
    }
    res.writeHead(200, {
      ...koepfe,
      'Content-Type': typen[path.extname(datei)] ?? 'application/octet-stream',
    });
    createReadStream(datei).pipe(res);
  });
}

// ── Hilfen ──────────────────────────────────────────────────────────────────
const warte = ms => new Promise(r => setTimeout(r, ms));

async function ueberlauf(seite, wo) {
  const shell = await seite.evaluate(() => ({
    breit: document.documentElement.scrollWidth - window.innerWidth,
    hoch: document.documentElement.scrollHeight - window.innerHeight,
  }));
  if (shell.breit > 1) rot(`${wo}: Seite ${shell.breit} px zu breit`);
  if (shell.hoch > 1) rot(`${wo}: Seite ${shell.hoch} px zu hoch (rollt unter dem Band)`);
  for (const rahmen of seite.frames().slice(1)) {
    const r = await rahmen
      .evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      .catch(() => 0);
    if (r > 1) rot(`${wo}: App ${new URL(rahmen.url()).pathname} ${r} px zu breit`);
  }
}

const saetze = new Set();
async function sammeln(seite) {
  for (const rahmen of seite.frames()) {
    const pfad = new URL(rahmen.url()).pathname;
    if (/^\/apps\/(angebote|wartungsplan|urlaub)\//.test(pfad)) continue;
    const liste = await rahmen
      .evaluate(() => {
        const aus = [];
        const gang = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
        );
        for (let k = gang.nextNode(); k; k = gang.nextNode()) {
          if (k.nodeType === 1) {
            if (k.closest('[data-demo-nicht-uebersetzen], script, style')) continue;
            for (const a of ['aria-label', 'title', 'placeholder']) {
              const w = k.getAttribute(a);
              if (w) aus.push(w.trim());
            }
          } else if (!k.parentElement?.closest('[data-demo-nicht-uebersetzen], script, style')) {
            const w = k.nodeValue.trim();
            if (w) aus.push(w);
          }
        }
        return aus;
      })
      .catch(() => []);
    for (const s of liste) if (/[a-zäöüß]{2}/i.test(s)) saetze.add(s);
  }
}

// Belege für den PR: die Schritte, die die Website erklärt.
const BELEGT = [
  '1-weg-app',
  '2-weg-rueckmeldung',
  '3-markierung',
  '4-weg-entwickler',
  '5-weg-eingang',
  '6-weg-live',
  '7-rabatt',
  '8-wartungsplan',
  '8-urlaub',
];
async function bild(seite, name) {
  if (BILDER && BELEGT.some(s => name.endsWith(`-${s}`))) {
    await seite.screenshot({ path: path.join(BILDER, `${name}.png`) });
  }
}

// ── Der Weg ─────────────────────────────────────────────────────────────────
async function weg(browser, basis, sprache, breite) {
  const kontext = await browser.newContext({
    viewport: { width: breite, height: breite < 600 ? 844 : breite < 1000 ? 1024 : 900 },
    locale: sprache === 'en' ? 'en-GB' : 'de-DE',
    serviceWorkers: 'allow',
  });
  const herkunft = new URL(basis).origin;
  kontext.on('request', r => {
    alleAnfragen.push(
      `${sprache} ${breite} ${r.method()} ${r.url()}${r.serviceWorker() ? ' (Service Worker)' : ''}`
    );
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== herkunft)
      rot(`fremde Herkunft: ${u.origin} (${r.url()})`);
  });
  await kontext.addInitScript(s => {
    try {
      localStorage.setItem('arasul-demo-sprache', s);
    } catch {}
  }, sprache);
  const seite = await kontext.newPage();
  const wo = `${sprache} ${breite}`;
  const name = s => `demo-${sprache}-${breite}-${s}`;
  seite.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text()))
      rot(`${wo}: Konsole: ${m.text()}`);
  });
  seite.on('pageerror', f => rot(`${wo}: Seitenfehler: ${f.message}`));
  // Ein unbekannter Weg der Demo antwortet 404 — sammeln, damit die Liste klein bleibt.
  seite.on('response', r => {
    if (r.status() === 404 && new URL(r.url()).pathname.startsWith('/api/')) {
      rot(`${wo}: kein gespielter Weg für ${new URL(r.url()).pathname}`);
    }
  });

  /** Der Hinweis des geführten Wegs steht bei Schritt `n` (J51). */
  const hinweis = async n => {
    await seite.locator(`[data-testid="demo-weg"][data-schritt="${n}"]:not([hidden])`).waitFor({
      timeout: 15_000,
    });
    await warte(400);
  };

  // 1. Startseite als Mitarbeiter, der Weg beginnt von selbst
  await seite.goto(basis + '/');
  await seite.getByTestId('uebersicht-seite').waitFor({ timeout: 20_000 });
  await seite.locator('.demo-band').waitFor();
  await hinweis(1);
  await ueberlauf(seite, `${wo} Startseite`);
  await bild(seite, name('1-weg-app'));
  if (SAMMELN) await sammeln(seite);
  const hatCockpit = await seite.getByTestId('uebersicht-app-entwickler-cockpit').count();
  if (hatCockpit) rot(`${wo}: der Mitarbeiter sieht das Cockpit`);

  // 2. „Weiter" öffnet Angebote (live, ohne Rabatt)
  await seite.getByTestId('demo-weg-weiter').click();
  const app = seite
    .frameLocator('[data-testid="app-rahmen-angebote"] iframe, iframe[src="/apps/angebote/"]')
    .first();
  await app.locator('.ara-kopf').waitFor({ timeout: 15_000 });
  await app.getByText(/1\.4\.0/).first().waitFor();
  await app.locator('[data-slot="kennzahl"]').first().waitFor();
  await hinweis(2);
  await ueberlauf(seite, `${wo} Angebote`);
  await bild(seite, name('2-weg-rueckmeldung'));

  // 3. Rückmeldung mit Foto und Markierung
  await seite.getByTestId('rueckmeldung-knopf').click();
  await seite.getByTestId('rueckmeldung-text').waitFor();
  await seite
    .getByTestId('rueckmeldung-text')
    .fill(
      sprache === 'en'
        ? 'A discount per quote would save me time.'
        : 'Ein Rabatt je Angebot würde mir Zeit sparen.'
    );
  const markierung = seite.getByTestId('rueckmeldung-markierung');
  if (await markierung.count()) {
    const box = await markierung.boundingBox();
    if (box) {
      await seite.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.2);
      await seite.mouse.down();
      await seite.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 5 });
      await seite.mouse.up();
    }
  } else {
    rot(`${wo}: kein Bildschirmfoto im Formular`);
  }
  if (SAMMELN) await sammeln(seite);
  await bild(seite, name('3-markierung'));
  await seite.getByTestId('rueckmeldung-absenden').click();
  await seite.getByTestId('rueckmeldung-bestaetigung').waitFor();
  if (SAMMELN) await sammeln(seite);
  await seite.getByTestId('rueckmeldung-fertig').click();

  // 4. Der Weg zeigt auf den Schalter im Band; „Weiter" wechselt zum Entwickler
  await hinweis(3);
  await bild(seite, name('4-weg-entwickler'));
  await seite.getByTestId('demo-weg-weiter').click();
  await seite.waitForURL(/entwickler-cockpit/);
  const cockpit = seite.frameLocator('iframe[src="/apps/entwickler-cockpit/"]');
  await cockpit.getByTestId('cockpit-eingang').waitFor({ timeout: 20_000 });
  const meldungText = sprache === 'en' ? 'A discount per quote' : 'Ein Rabatt je Angebot';
  await cockpit.getByText(meldungText).first().waitFor();
  await hinweis(4);
  await ueberlauf(seite, `${wo} Cockpit Eingang`);
  await bild(seite, name('5-weg-eingang'));
  if (SAMMELN) await sammeln(seite);
  await cockpit.getByText(meldungText).first().click();
  await warte(500);
  const hatBild = await cockpit.getByTestId('cockpit-bild').count();
  if (!hatBild) rot(`${wo}: die Meldung zeigt kein Bildschirmfoto im Cockpit`);
  if (SAMMELN) await sammeln(seite);
  await seite.keyboard.press('Escape');
  await warte(300);

  // 5. „Weiter" führt zu Test nach Live
  await seite.getByTestId('demo-weg-weiter').click();
  await cockpit.getByTestId('cockpit-live-schalten-angebote').waitFor({ timeout: 10_000 });
  await hinweis(5);
  await ueberlauf(seite, `${wo} Test nach Live`);
  await bild(seite, name('6-weg-live'));
  if (SAMMELN) await sammeln(seite);
  await cockpit.getByTestId('cockpit-live-schalten-angebote').click();
  const frage = cockpit.getByRole('alertdialog');
  await frage.waitFor();
  if (SAMMELN) await sammeln(seite);
  await frage.getByRole('button').last().click();
  await cockpit.getByTestId('cockpit-schalt-ausgang').waitFor({ timeout: 15_000 });
  await seite.getByTestId('demo-weg-weiter').click();
  await seite.locator('[data-testid="demo-weg"][hidden]').waitFor({ state: 'attached' });

  // Apps-Ansicht des Cockpits
  if (!(await cockpit.getByTestId('cockpit-leiste-apps').isVisible())) {
    await cockpit.getByTestId('cockpit-leiste-umschalten').click();
  }
  await cockpit.getByTestId('cockpit-leiste-apps').click();
  await warte(400);
  if (SAMMELN) await sammeln(seite);

  // 6. Angebote live rechnet jetzt mit Rabatt
  await seite.goto(basis + '/workspace/app/angebote');
  const live = seite.frameLocator('iframe[src="/apps/angebote/"]');
  await live
    .getByText(/1\.5\.0/)
    .first()
    .waitFor({ timeout: 15_000 });
  await live
    .getByText(sprache === 'en' ? 'after discount' : 'nach Rabatt')
    .first()
    .waitFor();
  await warte(300);
  await ueberlauf(seite, `${wo} Angebote mit Rabatt`);
  await bild(seite, name('7-rabatt'));

  // Die beiden anderen Beispiel-Apps: Seitenkopf, Kennzahl, Tabelle
  for (const id of ['wartungsplan', 'urlaub']) {
    await seite.goto(`${basis}/workspace/app/${id}`);
    const rahmen = seite.frameLocator(`iframe[src="/apps/${id}/"]`);
    await rahmen.locator('.ara-kopf').waitFor({ timeout: 15_000 });
    await rahmen.locator('[data-slot="kennzahl"]').first().waitFor();
    await warte(400);
    await ueberlauf(seite, `${wo} ${id}`);
    await bild(seite, name(`8-${id}`));
    if (SAMMELN) await sammeln(seite);
  }

  // Einstellungen (für alle gleich): nur sammeln und auf Überlauf prüfen
  await seite.goto(basis + '/workspace/settings/erscheinungsbild');
  await warte(1200);
  await ueberlauf(seite, `${wo} Einstellungen`);
  if (SAMMELN) await sammeln(seite);

  // „So geht’s" beginnt den Weg neu, als Mitarbeiter; „Überspringen" beendet ihn
  await seite.locator('.demo-band-hilfe').click();
  await seite.getByTestId('uebersicht-seite').waitFor();
  await hinweis(1);
  await seite.getByTestId('demo-weg-ueberspringen').click();
  await seite.locator('[data-testid="demo-weg"][hidden]').waitFor({ state: 'attached' });

  gruen(`${wo}: Weg vollständig`);
  await kontext.close();
}

// ── Lauf ────────────────────────────────────────────────────────────────────
const { chromium } = await ladePlaywright();
let basis = process.env.ARASUL_DEMO_URL?.replace(/\/$/, '');
let laufenderServer = null;
if (!basis) {
  if (!existsSync(path.join(bau, 'index.html'))) {
    console.log('ROT    dist-demo/ fehlt: zuerst `npm run demo:bauen`.');
    process.exit(1);
  }
  laufenderServer = server();
  await new Promise(r => laufenderServer.listen(0, '127.0.0.1', r));
  basis = `http://localhost:${laufenderServer.address().port}`;
}
if (BILDER) mkdirSync(BILDER, { recursive: true });

// Ein anderer Chromium als der zur Playwright-Fassung passende, falls nur er da ist.
const browser = await chromium.launch(
  process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}
);
try {
  for (const sprache of SPRACHEN) {
    for (const breite of SAMMELN ? [1440] : BREITEN) {
      try {
        await weg(browser, basis, sprache, breite);
      } catch (f) {
        rot(`${sprache} ${breite}: Weg abgebrochen: ${f.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
  laufenderServer?.close();
}

if (apiTreffer.length)
  rot(`Anfragen an /api/ erreichten den Server: ${[...new Set(apiTreffer)].join(', ')}`);
else if (laufenderServer) gruen('keine Anfrage an /api/ erreichte den Server');

if (PROTOKOLL) {
  const herkuenfte = [...new Set(alleAnfragen.map(z => new URL(z.split(' ')[3]).origin))];
  writeFileSync(
    PROTOKOLL,
    [
      `# Netzwerkprotokoll der Demo, ${new Date().toISOString()}`,
      `# Adresse: ${basis}`,
      `# Herkünfte: ${herkuenfte.join(', ')}`,
      `# Anfragen: ${alleAnfragen.length}`,
      ...alleAnfragen,
    ].join('\n') + '\n'
  );
  console.log(
    `Protokoll: ${PROTOKOLL} (${alleAnfragen.length} Anfragen, Herkünfte: ${herkuenfte.join(', ')})`
  );
}
if (SAMMELN) {
  console.log(JSON.stringify([...saetze].sort(), null, 2));
}
console.log(befunde.length ? `\n${befunde.length} Befund(e).` : '\nAlles grün.');
process.exit(befunde.length ? 1 : 0);
