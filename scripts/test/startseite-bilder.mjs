/**
 * Der Browser-Teil der Abnahme „Startseite und Statusleiste" (M5, 04.10.2026).
 * Gerufen von `startseite-abnahme.sh`, das die Probe-App hergestellt hat: Live
 * 1.0.0, Test 1.1.0, eine wartende Freigabe (Nummer in ARASUL_START_FREIGABE),
 * Zugang für probe-admin und A, keiner für B.
 *
 *   mitarbeiter     Als A: Gruß, „Für Sie" mit der Zeile (App, Gegenstand, seit
 *                   wann), Haus mit Zahl, Kacheln, keine Hinweise, Statusleiste
 *                   nur Name/Datum/Uhrzeit, ein Klick auf die Zeile öffnet die
 *                   App mit ?freigabe=<nummer>; zehn Wechsel App <-> Startseite
 *                   unter 200 ms.
 *   admin           Als probe-admin: dasselbe und zusätzlich der Hinweis
 *                   „Fassung wartet auf Live"; was sonst am Gerät ansteht,
 *                   wird nur aufgeschrieben.
 *   fremd           Als B (kein Zugang): „Keine Freigabe liegt bei Ihnen.", keine
 *                   Zahl am Haus, keine Hinweise.
 *   admin-nach-live Als probe-admin, nachdem 1.1.0 live ist: der Hinweis fehlt.
 *
 * Passwörter nur aus der Umgebung. Bilder unter docs/plans/audits/<tag>-startseite/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const B = process.env.ARASUL_B || '';
const B_PASS = process.env.ARASUL_B_PASSWORT || '';
const APP = process.env.ARASUL_START_APP || '';
const NAME = process.env.ARASUL_START_NAME || '';
const FREIGABE = process.env.ARASUL_START_FREIGABE || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-startseite`);
const PHASE = process.argv[2] || '';
const GRENZE_MS = 200;
const WECHSEL = 10;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !A || !A_PASS || !B || !B_PASS || !APP || !NAME || !FREIGABE) {
  console.log('ROT    Konten, Passwörter oder ARASUL_START_* fehlen -- der Aufrufer setzt sie.');
  process.exit(1);
}
if ([ADMIN, A, B].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
  process.exit(1);
}
if (!['mitarbeiter', 'admin', 'fremd', 'admin-nach-live'].includes(PHASE)) {
  console.log('ROT    Phase: mitarbeiter, admin, fremd oder admin-nach-live.');
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

async function sitzung(benutzer, passwort) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'de-DE',
  });
  const r = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  if (r.status() !== 200) {
    pruefe(`${benutzer} meldet sich im Browser an`, false, `HTTP ${r.status()}`);
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  seitenfehler (${benutzer}): ${e.message}`));
  return { ctx, page };
}

const bild = (page, name) =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: true });

async function sichtbar(locator, ms = 20000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}
const text = locator =>
  locator
    .first()
    .innerText()
    .catch(() => '');
const einzeilig = t => t.replace(/\n/g, ' | ');

async function startseite(page) {
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sichtbar(page.getByTestId('uebersicht-seite'), 30000);
  await sichtbar(page.getByTestId('offene-freigaben'), 30000);
  await page.waitForTimeout(1500);
}

/** Die Leiste unten: nur Name, Datum, Uhrzeit. */
async function statusleiste(page, erwartetName) {
  const leiste = await text(page.getByTestId('statusbar'));
  const jetzt = new Date();
  const uhr = jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const davor = new Date(jetzt.getTime() - 60_000).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  pruefe('Statusleiste nennt den Namen', leiste.includes(erwartetName), einzeilig(leiste));
  pruefe(
    'Statusleiste nennt das Datum',
    /\d{4}/.test(leiste) &&
      /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/.test(leiste)
  );
  pruefe(
    'Statusleiste nennt die Uhrzeit minutengenau',
    leiste.includes(uhr) || leiste.includes(davor),
    uhr
  );
  pruefe(
    'Statusleiste nennt nie Modell, Speicher, Verbindung, Fassung oder Freigabe',
    !/Modell|Speicher|Verbindung|Fassung|Freigabe|GB|Version/i.test(leiste)
  );
  pruefe(
    'Kein Modell-Umschalter, kein Knopf in der Statusleiste',
    (await page.getByTestId('statusbar').locator('button').count()) === 0 &&
      (await page.getByTestId('workspace-statusbar-model').count()) === 0
  );
  const box = await page.getByTestId('statusbar').boundingBox();
  pruefe('Statusleiste ist eine Zeile hoch', !!box && box.height <= 32, `${box?.height}px`);
}

/** Zehn Wechsel von der App zur Startseite und zurück, gemessen bis zum Zeichnen. */
async function wechsel(page) {
  const app = page.getByTestId(`leiste-app-${APP}-live`);
  if (!(await sichtbar(app))) {
    pruefe('Die Probe-App steht in der Leiste', false);
    return;
  }
  const messen = (knopf, bis) =>
    page.evaluate(
      async ([k, b]) => {
        const el = document.querySelector(`[data-testid="${k}"]`);
        const t0 = performance.now();
        el.click();
        while (!document.querySelector(`[data-testid="${b}"]`)) {
          await new Promise(r => requestAnimationFrame(r));
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      },
      [knopf, bis]
    );
  await app.click();
  await sichtbar(page.getByTestId(`app-rahmen-${APP}`));
  await page.waitForTimeout(1500);
  const zurueck = [];
  const hin = [];
  for (let i = 0; i < WECHSEL; i += 1) {
    zurueck.push(await messen('leiste-startseite', 'uebersicht-seite'));
    await page.waitForTimeout(300);
    hin.push(await messen(`leiste-app-${APP}-live`, `app-rahmen-${APP}`));
    await page.waitForTimeout(500);
  }
  const wort = l => {
    const sortiert = [...l].sort((x, y) => x - y);
    return `größter ${Math.round(sortiert.at(-1))} ms, Median ${Math.round(sortiert[Math.floor(l.length / 2)])} ms`;
  };
  pruefe(
    `Wechsel App -> Startseite unter ${GRENZE_MS} ms (${WECHSEL}x)`,
    Math.max(...zurueck) < GRENZE_MS,
    wort(zurueck)
  );
  pruefe(
    `Wechsel Startseite -> App unter ${GRENZE_MS} ms (${WECHSEL}x)`,
    Math.max(...hin) < GRENZE_MS,
    wort(hin)
  );
}

async function alsMitarbeiter() {
  const { ctx, page } = await sitzung(A, A_PASS);
  await startseite(page);
  const kopf = await text(page.locator('h1'));
  pruefe('Gruß mit Name', /^Guten Tag, \S+/.test(kopf), kopf);
  const z = await text(page.getByTestId(`freigabe-${FREIGABE}`));
  pruefe('Für Sie: eine Zeile mit der Probe-App', z.includes(NAME), einzeilig(z));
  pruefe('Die Zeile nennt den Gegenstand', z.includes('Beleg') && z.includes('pruefen'));
  pruefe('Die Zeile nennt seit wann', /wartet seit/.test(z));
  const zahl = (await text(page.getByTestId('leiste-freigaben-zahl'))).trim();
  pruefe('Das Haus trägt die Zahl der Freigaben für mich', /^[1-9]\d*$/.test(zahl), zahl);
  const fuerSie = await text(page.getByTestId('fuer-sie-zahl'));
  pruefe('„Für Sie" nennt dieselbe Zahl', fuerSie.startsWith(zahl), fuerSie);
  const kachel = page.getByTestId(`uebersicht-app-${APP}-live`);
  pruefe('Die Kachel der Probe-App steht darunter', await sichtbar(kachel, 5000));
  pruefe(
    'Ein Mitarbeiter sieht keine Hinweise',
    (await page.getByTestId('admin-hinweise').count()) === 0
  );
  pruefe('… und keine Fassung an der Kachel', !(await text(kachel)).includes('Fassung'));
  await statusleiste(page, A);
  await bild(page, 'startseite');
  await wechsel(page);
  await page.getByTestId('leiste-startseite').click();
  await sichtbar(page.getByTestId(`freigabe-${FREIGABE}-oeffnen`));
  await page.getByTestId(`freigabe-${FREIGABE}-oeffnen`).click();
  const rahmen = page.getByTestId(`app-rahmen-${APP}`);
  pruefe('Ein Klick öffnet die App im Rahmen', await sichtbar(rahmen));
  const src = (await rahmen.getAttribute('src').catch(() => '')) || '';
  pruefe(
    '… beim Vorgang (?freigabe=<nummer> im Rahmen)',
    src.endsWith(`?freigabe=${FREIGABE}`),
    src
  );
  pruefe(
    '… und in der Adresse der Shell',
    page.url().endsWith(`/workspace/app/${APP}?freigabe=${FREIGABE}`),
    page.url()
  );
  await page.waitForTimeout(1500);
  await bild(page, 'app-beim-vorgang');
  await ctx.close();
}

async function alsAdmin(nachLive) {
  const { ctx, page } = await sitzung(ADMIN, ADMIN_PASS);
  await startseite(page);
  const kopf = await text(page.locator('h1'));
  pruefe('Gruß mit Name', /^Guten Tag, \S+/.test(kopf), kopf);
  pruefe(
    'Für Sie: die Zeile der Probe-App',
    (await text(page.getByTestId(`freigabe-${FREIGABE}`))).includes(NAME)
  );
  await page.waitForTimeout(2500);
  const hinweise = page.getByTestId('admin-hinweise');
  const alle = (await hinweise.count()) ? einzeilig(await text(hinweise)) : '';
  const fassung = page.getByTestId('admin-hinweis-fassung-wartet');
  const meine = (await fassung.allInnerTexts()).filter(t => t.includes(NAME));
  if (nachLive) {
    pruefe(
      'Nach „live" steht kein Hinweis „Fassung wartet" für die Probe-App',
      meine.length === 0,
      alle
    );
  } else {
    pruefe(
      'Hinweis „Fassung wartet auf Live" für die Probe-App',
      meine.length === 1,
      meine.join(' | ')
    );
    const g = await text(page.getByTestId('uebersicht-seite'));
    pruefe(
      'Die Hinweise stehen unter den Kacheln',
      g.indexOf(NAME) < g.indexOf('Braucht Ihre Aufmerksamkeit')
    );
  }
  console.log(`  aufgeschrieben: Hinweise am Gerät: ${alle || '(keine)'}`);
  pruefe('Kein Hinweis meldet Erfolg', !/Alles (gut|läuft)|erfolgreich|in Ordnung/i.test(alle));
  await bild(page, 'startseite');
  if (!nachLive) {
    await statusleiste(page, ADMIN);
    await wechsel(page);
    await page.getByTestId('leiste-startseite').click();
    await sichtbar(fassung);
    await fassung.filter({ hasText: NAME }).click();
    await page.waitForTimeout(1500);
    pruefe(
      'Ein Klick auf den Hinweis führt auf die Seite der App in der Verwaltung',
      page.url().endsWith(`/workspace/verwaltung/apps/${APP}`),
      page.url()
    );
  }
  await ctx.close();
}

async function alsFremder() {
  const { ctx, page } = await sitzung(B, B_PASS);
  await startseite(page);
  const abschnitt = await text(page.getByTestId('offene-freigaben'));
  pruefe(
    'Ohne Zugang: „Keine Freigabe liegt bei Ihnen."',
    abschnitt.includes('Keine Freigabe liegt bei Ihnen.'),
    einzeilig(abschnitt)
  );
  pruefe(
    'Das Haus trägt keine Zahl',
    (await page.getByTestId('leiste-freigaben-zahl').count()) === 0
  );
  pruefe(
    'Keine Zeile der Probe-App',
    (await page.getByTestId(`freigabe-${FREIGABE}`).count()) === 0
  );
  pruefe('Keine Hinweise', (await page.getByTestId('admin-hinweise').count()) === 0);
  await statusleiste(page, B);
  await bild(page, 'startseite');
  await ctx.close();
}

try {
  if (PHASE === 'mitarbeiter') await alsMitarbeiter();
  else if (PHASE === 'admin') await alsAdmin(false);
  else if (PHASE === 'admin-nach-live') await alsAdmin(true);
  else await alsFremder();
} catch (e) {
  pruefe('Der Browser-Teil lief durch', false, e.message);
} finally {
  await browser.close();
}
process.exit(ergebnisse.every(e => e.ok) ? 0 : 1);
