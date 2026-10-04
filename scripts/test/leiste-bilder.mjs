/**
 * Der Browser-Teil der Abnahme „Apps im Hintergrund und Sortieren" (M5,
 * 04.10.2026). Gerufen von `leiste-abnahme.sh` mit vier Probe-Apps
 * (`ARASUL_LEISTE_APPS`, kommagetrennt: Kennung:Kürzel). Als A:
 *
 *   symbol       Die Leiste zeigt das Symbol aus app.json: ein Lucide-Name als
 *                Bild, ein Kürzel als Text, ohne Symbol und bei unbekanntem
 *                Namen das Kürzel aus dem Namen.
 *   hintergrund  Vier Apps nacheinander öffnen, je Eingabe und Scrollstand. Die
 *                offene und die drei im Hintergrund behalten beides (und laden
 *                nicht neu); auf der Startseite fällt die vierte heraus und
 *                fängt beim Öffnen von vorn an. Wechsel unter 200 ms; Speicher
 *                des Browsers mit null, einer und drei Apps im Hintergrund.
 *   sortieren    Ziehen ordnet die Leiste; die Reihenfolge steht am Gerät
 *                (GET /api/apps/reihenfolge, zweite Sitzung sieht sie, der
 *                andere Mensch nicht); Alt+Pfeil als Tastatur-Alternative;
 *                niedrige Fenster: die Leiste scrollt.
 *
 * VORAUSSETZUNG: `playwright` steht in keinem Lockfile dieses Repos. Es muss
 * von hier auflösbar sein (`npm i --no-save playwright` im Wurzelordner) ODER
 * `ARASUL_PLAYWRIGHT` zeigt auf einen Ordner, in dem `node_modules/playwright`
 * liegt (z. B. ein anderer Checkout). Danach `npx playwright install chromium`,
 * oder `ARASUL_CHROMIUM` auf eine vorhandene Chromium-Datei.
 *
 * Passwörter nur aus der Umgebung, nie das Konto admin. Bilder unter
 * docs/plans/audits/<tag>-leiste/.
 *
 *   node scripts/test/leiste-bilder.mjs <phase>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

async function ladePlaywright() {
  try {
    return await import('playwright');
  } catch {
    const ort = process.env.ARASUL_PLAYWRIGHT;
    if (!ort) {
      console.log(
        'ROT    playwright fehlt: `npm i --no-save playwright` im Wurzelordner oder ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>.'
      );
      process.exit(1);
    }
    return createRequire(path.join(ort, 'x.js'))('playwright');
  }
}
const { chromium } = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const APPS = (process.env.ARASUL_LEISTE_APPS || '')
  .split(',')
  .filter(Boolean)
  .map(x => {
    const [id, kuerzel] = x.split(':');
    return { id, kuerzel };
  });
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-leiste`);
const PHASE = process.argv[2] || '';
const GRENZE_MS = 200;
const WECHSEL = 10;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !A || !A_PASS || APPS.length !== 4) {
  console.log('ROT    Konten, Passwörter oder ARASUL_LEISTE_APPS (vier Apps) fehlen.');
  process.exit(1);
}
if ([ADMIN, A].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
  process.exit(1);
}
if (!['symbol', 'hintergrund', 'sortieren'].includes(PHASE)) {
  console.log('ROT    Phase: symbol, hintergrund oder sortieren.');
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

async function sitzung(benutzer, passwort, viewport = { width: 1440, height: 800 }) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
    colorScheme: 'light',
    locale: 'de-DE',
  });
  const r = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  if (r.status() !== 200)
    pruefe(`${benutzer} meldet sich im Browser an`, false, `HTTP ${r.status()}`);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  seitenfehler (${benutzer}): ${e.message}`));
  return { ctx, page };
}

const bild = (page, name) =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: false });

async function sichtbar(locator, ms = 20000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

async function workspace(page) {
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sichtbar(page.getByTestId('leiste-apps'), 30000);
  await page.waitForTimeout(1000);
}

const knopf = (page, app) => page.getByTestId(`leiste-app-${app.id}-live`);
const stapel = (page, app) => page.getByTestId(`app-stapel-${app.id}-live`);
const rahmen = (page, app) => page.frameLocator(`[data-testid="app-rahmen-${app.id}"]`);

/** Reihenfolge der vier Probe-Apps, wie sie in der Leiste stehen. */
async function leistenFolge(page) {
  const ids = await page
    .getByTestId('leiste-apps')
    .locator('button')
    .evaluateAll(l => l.map(b => b.getAttribute('data-testid')));
  return APPS.map(a => ({ id: a.id, i: ids.indexOf(`leiste-app-${a.id}-live`) }))
    .filter(x => x.i >= 0)
    .sort((x, y) => x.i - y.i)
    .map(x => x.id);
}

async function oeffne(page, app) {
  await knopf(page, app).click();
  await rahmen(page, app).locator('#feld').waitFor({ state: 'visible', timeout: 30000 });
}

async function marke(page, app) {
  return page.locator(`[data-testid="app-rahmen-${app.id}"]`).evaluate(f => f.contentWindow.__lade);
}

async function apiGet(ctx, pfad) {
  const r = await ctx.request.get(`${URL}${pfad}`);
  return r.status() === 200 ? (await r.json()).data : null;
}

/** Alle Prozesse des Browsers (Nachfahren dieses Prozesses), Speicher in MB (RSS). */
function browserSpeicherMB() {
  const zeilen = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map(z => z.trim().split(/\s+/).map(Number));
  const kinder = new Map();
  for (const [pid, ppid, rss] of zeilen) {
    if (!kinder.has(ppid)) kinder.set(ppid, []);
    kinder.get(ppid).push({ pid, rss });
  }
  let summe = 0;
  const stapelPids = [process.pid];
  while (stapelPids.length) {
    for (const k of kinder.get(stapelPids.pop()) ?? []) {
      summe += k.rss;
      stapelPids.push(k.pid);
    }
  }
  return Math.round(summe / 1024);
}

async function phaseSymbol() {
  const { ctx, page } = await sitzung(A, A_PASS);
  const meine = await apiGet(ctx, '/api/apps/meine');
  const sym = id => (meine ?? []).find(a => a.id === id)?.symbol ?? null;
  pruefe(
    'Das Backend liefert symbol aus app.json an die Oberfläche',
    sym(APPS[0].id) === 'file-text' && sym(APPS[1].id) === 'Q7' && sym(APPS[2].id) === null,
    `${APPS.map(a => `${a.id.slice(-1)}=${sym(a.id)}`).join(' ')}`
  );
  await workspace(page);
  for (const [i, erwartung] of ['bild', 'text', 'text', 'text'].entries()) {
    const k = knopf(page, APPS[i]);
    if (!(await sichtbar(k))) {
      pruefe(`${APPS[i].id} steht in der Leiste`, false);
      continue;
    }
    // Das Lucide-Bündel kommt nach; kurz warten.
    await page.waitForTimeout(erwartung === 'bild' ? 2500 : 300);
    const hatBild = (await k.locator('svg').count()) > 0;
    const text = (await k.innerText()).trim();
    if (erwartung === 'bild') {
      pruefe(
        'Lucide-Name `file-text`: die Leiste zeigt das Bild, kein Kürzel',
        hatBild && text === '',
        `svg=${hatBild}`
      );
    } else {
      const soll = [null, 'Q7', APPS[2].kuerzel, APPS[3].kuerzel][i];
      const art = [
        '',
        'Kürzel aus app.json',
        'ohne Symbol: Kürzel aus dem Namen',
        'unbekannter Lucide-Name: Kürzel aus dem Namen',
      ][i];
      pruefe(`${art} (${soll})`, !hatBild && text === soll, `Text „${text}"`);
    }
  }
  await bild(page, 'leiste');
  await ctx.close();
}

async function phaseHintergrund() {
  const { ctx, page } = await sitzung(A, A_PASS);
  await workspace(page);
  const [a, b, c, d] = APPS;
  const marken = {};
  const grundlinie = browserSpeicherMB();
  const startseite = browserSpeicherMB();

  // Vier Apps nacheinander öffnen, je Eingabe und Scrollstand.
  for (const [i, app] of [a, b, c, d].entries()) {
    await oeffne(page, app);
    await rahmen(page, app).locator('#feld').fill(`Eingabe ${app.id}`);
    await page
      .locator(`[data-testid="app-rahmen-${app.id}"]`)
      .evaluate((f, y) => f.contentWindow.scrollTo(0, y), 400 + 100 * i);
    marken[app.id] = await marke(page, app);
  }
  await page.waitForTimeout(500);
  await bild(page, 'vier-apps');

  const erhalten = async (app, i) => {
    const wert = await rahmen(page, app).locator('#feld').inputValue();
    const y = await page
      .locator(`[data-testid="app-rahmen-${app.id}"]`)
      .evaluate(f => Math.round(f.contentWindow.scrollY));
    const gleich = (await marke(page, app)) === marken[app.id];
    return { ok: wert === `Eingabe ${app.id}` && y === 400 + 100 * i && gleich, wert, y, gleich };
  };

  // Alle vier sind am Leben: die offene und drei im Hintergrund.
  await knopf(page, a).click();
  await sichtbar(stapel(page, a));
  let r = await erhalten(a, 0);
  pruefe(
    'Offen d, im Hintergrund a, b, c: zurück zu a, Eingabe und Scrollstand da, kein Neuladen',
    r.ok,
    JSON.stringify(r)
  );

  // Startseite: nur drei im Hintergrund (a, d, c); b fällt heraus.
  await page.getByTestId('leiste-startseite').click();
  await page.waitForTimeout(500);
  const imStapel = await page.locator('[data-testid^="app-stapel-"]').count();
  pruefe(
    'Auf der Startseite leben genau drei Apps im Hintergrund',
    imStapel === 3,
    `${imStapel} Rahmen`
  );
  const verborgen = await page
    .locator('[data-testid^="app-stapel-"][data-sichtbar="false"]')
    .count();
  pruefe('… alle drei verborgen, nicht sichtbar', verborgen === 3, `${verborgen}`);
  pruefe(
    '… die vierte (b, am längsten nicht benutzt) ist herausgefallen',
    (await stapel(page, b).count()) === 0
  );
  const speicher3 = browserSpeicherMB();
  await bild(page, 'startseite-drei-im-hintergrund');

  for (const app of [c, d]) {
    await knopf(page, app).click();
    await sichtbar(stapel(page, app));
    const i = APPS.indexOf(app);
    r = await erhalten(app, i);
    pruefe(
      `Zurück zu ${app.id.slice(-1)} aus dem Hintergrund: Eingabe, Scrollstand, kein Neuladen`,
      r.ok,
      JSON.stringify(r)
    );
  }
  await bild(page, 'zurueck-aus-dem-hintergrund');

  // Die vierte fängt von vorn an.
  await page.getByTestId('leiste-startseite').click();
  await page.waitForTimeout(300);
  await oeffne(page, b);
  const leer = await rahmen(page, b).locator('#feld').inputValue();
  pruefe(
    'Die herausgefallene App b fängt von vorn an (Feld leer, neue Ladung)',
    leer === '' && (await marke(page, b)) !== marken[b.id],
    `Feld „${leer}"`
  );

  // Wechsel unter 200 ms: Startseite <-> App im Hintergrund, App <-> App.
  const messen = (knopfId, bis) =>
    page.evaluate(
      async ([k, b]) => {
        const el = document.querySelector(`[data-testid="${k}"]`);
        const t0 = performance.now();
        el.click();
        while (
          document.querySelector(`[data-testid="${b}"]`)?.getAttribute('data-sichtbar') !==
            'true' &&
          b.startsWith('app-stapel')
        ) {
          await new Promise(r => requestAnimationFrame(r));
        }
        while (!b.startsWith('app-stapel') && !document.querySelector(`[data-testid="${b}"]`)) {
          await new Promise(r => requestAnimationFrame(r));
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      },
      [knopfId, bis]
    );
  // Aufstellung: c, d, b leben (b offen). Start: Startseite.
  await page.getByTestId('leiste-startseite').click();
  await page.waitForTimeout(500);
  const folge = [c, d, b];
  const zeiten = [];
  for (let i = 0; i < WECHSEL; i += 1) {
    const app = folge[i % 3];
    zeiten.push(await messen(`leiste-app-${app.id}-live`, `app-stapel-${app.id}-live`));
    await page.waitForTimeout(300);
  }
  const hinweg = [];
  for (let i = 0; i < WECHSEL; i += 1) {
    hinweg.push(await messen('leiste-startseite', 'uebersicht-seite'));
    await page.waitForTimeout(300);
    const app = folge[i % 3];
    hinweg.push(await messen(`leiste-app-${app.id}-live`, `app-stapel-${app.id}-live`));
    await page.waitForTimeout(300);
  }
  const wort = l => {
    const s = [...l].sort((x, y) => x - y);
    return `größter ${Math.round(s.at(-1))} ms, Median ${Math.round(s[Math.floor(l.length / 2)])} ms`;
  };
  pruefe(
    `Wechsel App -> App aus dem Hintergrund unter ${GRENZE_MS} ms (${WECHSEL}x)`,
    Math.max(...zeiten) < GRENZE_MS,
    wort(zeiten)
  );
  pruefe(
    `Wechsel Startseite <-> App im Hintergrund unter ${GRENZE_MS} ms (${2 * WECHSEL}x)`,
    Math.max(...hinweg) < GRENZE_MS,
    wort(hinweg)
  );
  const nachWechsel = await erhalten(c, 2);
  pruefe(
    'Nach zwanzig Wechseln hat c noch Eingabe und Scrollstand',
    nachWechsel.ok,
    JSON.stringify(nachWechsel)
  );

  await page.waitForTimeout(1500);
  const speicherNachher = browserSpeicherMB();
  console.log(
    `  speicher Browser (Summe RSS aller Prozesse): leere Seite ${grundlinie} MB, Startseite ${startseite} MB, ` +
      `drei Apps im Hintergrund ${speicher3} MB, nach den Wechseln ${speicherNachher} MB`
  );
  pruefe(
    'Speicher des Browsers mit drei Apps im Hintergrund gemessen',
    speicher3 > 0,
    `${speicher3} MB gegen ${startseite} MB auf der Startseite`
  );
  await ctx.close();
}

async function phaseSortieren() {
  const { ctx, page } = await sitzung(A, A_PASS);
  const { ctx: ctxAdmin } = await sitzung(ADMIN, ADMIN_PASS);
  await workspace(page);
  const ids = APPS.map(x => x.id);
  const vorher = await leistenFolge(page);
  pruefe('Die vier Probe-Apps stehen in der Leiste', vorher.length === 4, vorher.join(' '));

  // Ziehen: die letzte der vier vor die erste.
  const letzte = vorher[3];
  const erste = vorher[0];
  await page
    .getByTestId(`leiste-app-${letzte}-live`)
    .dragTo(page.getByTestId(`leiste-app-${erste}-live`));
  await page.waitForTimeout(1000);
  const nach = await leistenFolge(page);
  pruefe(
    'Ziehen ordnet die Leiste: die letzte steht vorn',
    nach[0] === letzte && nach.length === 4,
    nach.join(' ')
  );
  await bild(page, 'gezogen');

  // Am Gerät gespeichert, nicht nur im Browser.
  const liste = await apiGet(ctx, '/api/apps/reihenfolge');
  const eigene = (liste ?? [])
    .filter(k => ids.some(i => k.startsWith(`${i}:`)))
    .map(k => k.split(':')[0]);
  pruefe(
    'Am Gerät gespeichert (GET /api/apps/reihenfolge)',
    JSON.stringify(eigene) === JSON.stringify(nach),
    eigene.join(' ')
  );
  const lokal = await page.evaluate(() =>
    JSON.stringify(Object.entries(localStorage)).includes('reihenfolge')
  );
  pruefe('… und nicht im localStorage des Browsers', !lokal);

  // Eine zweite Sitzung (anderer Browserkontext, frische Anmeldung) sieht sie.
  const { ctx: ctx2, page: page2 } = await sitzung(A, A_PASS);
  await workspace(page2);
  const zweite = await leistenFolge(page2);
  pruefe(
    'Eine zweite, frische Sitzung derselben Person sieht dieselbe Reihenfolge',
    JSON.stringify(zweite) === JSON.stringify(nach),
    zweite.join(' ')
  );
  await ctx2.close();

  // Ein anderer Mensch behält seine Reihenfolge.
  const listeAdmin = await apiGet(ctxAdmin, '/api/apps/reihenfolge');
  pruefe(
    'Die Reihenfolge von probe-admin bleibt davon unberührt',
    (listeAdmin ?? []).filter(k => ids.some(i => k.startsWith(`${i}:`))).length === 0,
    JSON.stringify(listeAdmin)
  );

  // Tastatur: Alt+Pfeil runter / hoch.
  const k = page.getByTestId(`leiste-app-${nach[0]}-live`);
  await k.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(800);
  const runter = await leistenFolge(page);
  pruefe(
    'Alt+Pfeil runter schiebt die fokussierte App eine Stelle nach unten',
    runter[1] === nach[0] && runter[0] === nach[1],
    runter.join(' ')
  );
  pruefe(
    '… der Fokus bleibt auf dem Knopf',
    await page.evaluate(
      id => document.activeElement?.getAttribute('data-testid') === id,
      `leiste-app-${nach[0]}-live`
    )
  );
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(800);
  const hoch = await leistenFolge(page);
  pruefe(
    'Alt+Pfeil hoch schiebt sie zurück',
    JSON.stringify(hoch) === JSON.stringify(nach),
    hoch.join(' ')
  );
  const ansage = (await page.locator('nav [role="status"]').innerText()).trim();
  pruefe('Die Verschiebung wird angesagt (aria-live)', /Platz \d von \d+/.test(ansage), ansage);

  // Nach einem Neuladen derselbe Stand.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sichtbar(page.getByTestId('leiste-apps'), 30000);
  await page.waitForTimeout(1000);
  pruefe(
    'Nach dem Neuladen steht die Leiste wie zuvor',
    JSON.stringify(await leistenFolge(page)) === JSON.stringify(nach)
  );

  // Die Leiste scrollt, wenn der Platz nicht reicht.
  await page.setViewportSize({ width: 1440, height: 220 });
  await page.waitForTimeout(500);
  const m = await page.getByTestId('leiste-apps').evaluate(e => ({
    sh: e.scrollHeight,
    ch: e.clientHeight,
    oy: getComputedStyle(e).overflowY,
    n: e.querySelectorAll('button').length,
  }));
  pruefe(
    'In einem niedrigen Fenster scrollt die Leiste der Apps (Knöpfe unten bleiben)',
    m.sh > m.ch && m.oy === 'auto',
    `Inhalt ${m.sh} px in ${m.ch} px, ${m.n} Apps`
  );
  const unten = await page.getByTestId('leiste-einstellungen').boundingBox();
  pruefe(
    '… Zahnrad und Konto bleiben im Bild',
    !!unten && unten.y + unten.height <= 220,
    `${Math.round(unten?.y ?? 0)} px`
  );
  await bild(page, 'niedrig');
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.waitForTimeout(300);
  const platz = await page
    .getByTestId('leiste-apps')
    .evaluate(e => Math.floor(e.clientHeight / 40));
  console.log(
    `  platz in der Leiste bei 720 px Fensterhöhe: etwa ${platz} Apps, danach scrollt sie`
  );
  await ctx.close();
  await ctxAdmin.close();
}

try {
  if (PHASE === 'symbol') await phaseSymbol();
  if (PHASE === 'hintergrund') await phaseHintergrund();
  if (PHASE === 'sortieren') await phaseSortieren();
} catch (fehler) {
  pruefe('Browser-Teil ohne Ausnahme', false, String(fehler).split('\n')[0]);
}
await browser.close();
process.exit(ergebnisse.some(e => !e.ok) ? 1 : 0);
