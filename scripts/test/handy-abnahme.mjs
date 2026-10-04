/**
 * Abnahme „Handy: Leiste unten, Tabellen als Listen, Notizen weg" (M5,
 * 04.10.2026), am Orin im Browser bei 390 px Breite. Als probe-admin und als
 * ein Mitarbeiter-Probekonto:
 *
 *   leiste     Die Aktivitätsleiste steht unten (Unterkante auf dem Schirm,
 *              Breite = Fenster), links keine; Haus, höchstens vier Apps,
 *              „Mehr" mit den übrigen Apps, Verwaltung (nur Admin),
 *              Einstellungen, Abmelden. Die Statusleiste entfällt.
 *   breite     Auf keiner Ansicht waagerechtes Scrollen:
 *              scrollWidth <= clientWidth (Startseite, Einstellungen, jeder
 *              Bereich der Verwaltung, die Seite jeder App in der Verwaltung).
 *   listen     In Personen, Freigaben, Läufe und App-Seite steht keine
 *              `<table>` im Dokument.
 *   notizen    GET /api/notizen antwortet 404.
 *
 * VORAUSSETZUNG: `playwright` steht in keinem Lockfile dieses Repos:
 * `npm i --no-save playwright` im Wurzelordner ODER
 * ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>; Chromium über
 * `npx playwright install chromium` oder ARASUL_CHROMIUM=<Datei>.
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   node scripts/test/handy-abnahme.mjs
 *
 * Passwörter nur aus der Umgebung, nie das Konto admin. Bilder:
 * ARASUL_BILDER=1 (docs/plans/audits/<tag>-handy/). Rückgabe 0 bei lauter Grün.
 */
import fs from 'node:fs';
import path from 'node:path';
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
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-handy`);
const BILDER = process.env.ARASUL_BILDER === '1';
const BEREICHE = [
  'general',
  'apps',
  'benutzer',
  'firmenordner',
  'modelle',
  'ki',
  'security',
  'privacy',
  'system',
  'lizenz',
  'remote-access',
];
const MIT_LISTEN = ['benutzer', 'apps'];

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !A || !A_PASS) {
  console.log(
    'ROT    Konten und Passwörter fehlen (ARASUL_BENUTZER/_PASSWORT, ARASUL_A/_A_PASSWORT).'
  );
  process.exit(1);
}
if ([ADMIN, A].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
  process.exit(1);
}
if (BILDER) fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

async function sitzung(benutzer, passwort) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    locale: 'de-DE',
  });
  const r = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  pruefe(`${benutzer} meldet sich an`, r.status() === 200, `HTTP ${r.status()}`);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  seitenfehler (${benutzer}): ${e.message}`));
  return { ctx, page, request: ctx.request };
}

async function geheZu(page, pfad) {
  await page.goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="workspace-shell"]', { timeout: 30000 });
  await page.waitForTimeout(900);
}

const breite = page =>
  page.evaluate(() => {
    const el = document.documentElement;
    const main = document.querySelector('[data-testid="workspace-ansicht"]');
    return {
      seite: [el.scrollWidth, el.clientWidth],
      ansicht: main ? [main.scrollWidth, main.clientWidth] : [0, 0],
    };
  });

const bild = (page, name) =>
  BILDER ? page.screenshot({ path: path.join(ZIEL, `${name}.png`) }) : Promise.resolve();

async function leiste(page, wer, istAdmin) {
  await geheZu(page, '/workspace/dashboard');
  const nav = page.getByTestId('aktivitaetsleiste');
  const box = await nav.boundingBox();
  const vp = page.viewportSize();
  pruefe(
    `${wer}: Leiste steht unten und füllt die Breite`,
    !!box && Math.abs(box.y + box.height - vp.height) <= 1 && Math.abs(box.width - vp.width) <= 1,
    box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} b=${Math.round(box.width)}` : 'fehlt'
  );
  pruefe(`${wer}: keine Statusleiste`, (await page.getByTestId('statusbar').count()) === 0);
  const apps = await page.locator('[data-testid^="leiste-app-"]').count();
  pruefe(`${wer}: höchstens vier Apps in der Leiste`, apps <= 4, `${apps}`);
  pruefe(
    `${wer}: Haus und Mehr sind da`,
    (await page.getByTestId('leiste-startseite').count()) === 1 &&
      (await page.getByTestId('leiste-mehr').count()) === 1
  );
  await page.getByTestId('leiste-mehr').click();
  const menue = page.getByTestId('leiste-mehr-menue');
  await menue.waitFor({ state: 'visible', timeout: 5000 });
  pruefe(
    `${wer}: Mehr zeigt Einstellungen und Abmelden`,
    (await menue.getByTestId('leiste-einstellungen').count()) === 1 &&
      (await menue.getByTestId('workspace-abmelden').count()) === 1
  );
  pruefe(
    `${wer}: Verwaltung unter Mehr ${istAdmin ? 'ja' : 'nein'}`,
    (await menue.getByTestId('leiste-verwaltung').count()) === (istAdmin ? 1 : 0)
  );
  const m = await menue.boundingBox();
  pruefe(
    `${wer}: das Menü liegt im Schirm`,
    !!m && m.x >= 0 && m.x + m.width <= vp.width && m.y >= 0
  );
  await bild(page, `${wer}-mehr`);
  await page.keyboard.press('Escape');
  await bild(page, `${wer}-start`);
}

async function breiten(page, wer, istAdmin) {
  const adressen = ['/workspace/dashboard', '/workspace/settings'];
  if (istAdmin) {
    for (const b of BEREICHE) adressen.push(`/workspace/verwaltung/${b}`);
    await geheZu(page, '/workspace/verwaltung/apps');
    const apps = await page.evaluate(async () => {
      const r = await fetch('/api/apps', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      return (j.data || j.apps || []).map(a => a.id).filter(Boolean);
    });
    for (const id of apps) adressen.push(`/workspace/verwaltung/apps/${id}`);
  }
  for (const pfad of adressen) {
    await geheZu(page, pfad);
    const b = await breite(page);
    const ok = b.seite[0] <= b.seite[1] && b.ansicht[0] <= b.ansicht[1];
    pruefe(
      `${wer}: ${pfad} ohne waagerechtes Scrollen`,
      ok,
      `Seite ${b.seite.join('/')}, Ansicht ${b.ansicht.join('/')}`
    );
    const bereich = pfad.split('/')[3];
    if (istAdmin && MIT_LISTEN.includes(bereich)) {
      const tabellen = await page.locator('main table').count();
      pruefe(`${wer}: ${pfad} ohne Tabelle (Liste)`, tabellen === 0, `${tabellen} Tabellen`);
    }
    if (pfad.startsWith('/workspace/verwaltung/apps/'))
      await bild(page, `${wer}-app-${pfad.split('/').pop()}`);
    else if (BILDER) await bild(page, `${wer}-${pfad.replace(/\W+/g, '_')}`);
  }
}

try {
  const admin = await sitzung(ADMIN, ADMIN_PASS);
  const r = await admin.request.get(`${URL}/api/notizen`);
  pruefe('GET /api/notizen antwortet 404', r.status() === 404, `HTTP ${r.status()}`);
  await leiste(admin.page, 'admin', true);
  await breiten(admin.page, 'admin', true);
  await admin.ctx.close();

  const a = await sitzung(A, A_PASS);
  await leiste(a.page, 'mitarbeiter', false);
  await breiten(a.page, 'mitarbeiter', false);
  await a.ctx.close();
} finally {
  await browser.close();
}
console.log(rot === 0 ? '\nalles gruen' : `\n${rot} ROT`);
process.exit(rot === 0 ? 0 : 1);
