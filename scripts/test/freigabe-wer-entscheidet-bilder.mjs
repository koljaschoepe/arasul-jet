/**
 * Der Browser-Teil der Abnahme „Freigabe sagt, wer entscheidet" (J35,
 * 26.09.2026), seit J36 (02.10.2026) auch der Beleg, dass ein Mitarbeiter keine
 * Technik sieht und Freigaben nur in der App entscheidet. Gerufen von
 * `freigabe-wer-entscheidet-abnahme.sh`, die die Proben-App einspielt und
 * danach wieder entfernt.
 *
 * Drei Menschen, dieselbe Freigabe von drei Seiten:
 *
 *   M1 reicht in der Proben-App ein und liest dort, wer entscheidet (der Satz
 *      kommt aus `freigabe.satz` des Geraets). Auf seiner Startseite steht
 *      keine Freigabenliste, die Statusleiste ist leer, und kein Toast nennt
 *      einen HTTP-Code oder englischen Text.
 *   ADMIN sieht weiter alles: die Liste auf der Startseite, Fassung und
 *      Verbindung in der Statusleiste.
 *   M2 sieht an der Kachel der App eine Zahl, keine Liste; in der App steht der
 *      Baustein `Freigabe` (Bibliothek 5.2.0, im Artefakt ausgeliefert): ohne
 *      Begruendung geht Ablehnen nicht, mit ihr schon; das Bestaetigen
 *      entfernt die Karte ohne Neuladen. Danach steht in der App die leere Zeile.
 *
 * Dazu die Grenzen aus Sicht von M1: eine App ohne Freigabe als Seite mit
 * einem Satz (`ARASUL_SPERR_APP`), die Einstellungen mit dem Satz, dass der
 * Administrator sie verwaltet, und der Rahmen einer echten App bei 1440 px
 * (`ARASUL_RAHMEN_APP`): Notizen und Sidebar zu, nichts ragt ueber den Rand.
 *
 * Bilder unter docs/plans/audits/<tag>-freigabe-wer-entscheidet/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const M1 = process.env.ARASUL_M1 || '';
const M1_PASS = process.env.ARASUL_M1_PASSWORT || '';
const M2 = process.env.ARASUL_M2 || '';
const M2_PASS = process.env.ARASUL_M2_PASSWORT || '';
const ADMIN = process.env.ARASUL_ADMIN || '';
const ADMIN_PASS = process.env.ARASUL_ADMIN_PASSWORT || '';
const APP = process.env.ARASUL_PROBE_APP || 'probe-freigabe';
const APP_NAME = process.env.ARASUL_PROBE_NAME || 'Probe: Wer entscheidet';
const RAHMEN_APP = process.env.ARASUL_RAHMEN_APP || '';
const RAHMEN_NAME = process.env.ARASUL_RAHMEN_NAME || '';
const SPERR_APP = process.env.ARASUL_SPERR_APP || '';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-freigabe-wer-entscheidet`);

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!M1 || !M1_PASS || !M2 || !M2_PASS) {
  console.log(
    'ROT    ARASUL_M1/_PASSWORT und ARASUL_M2/_PASSWORT fehlen -- der Aufrufer setzt sie.'
  );
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

async function sitzung(benutzer, passwort, breite = 1440) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: breite, height: 900 },
  });
  const r = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  pruefe(`${benutzer} meldet sich an`, r.status() === 200, `HTTP ${r.status()}`);
  const page = await ctx.newPage();
  // Was eine Seite oder ihr Rahmen an Fehlern wirft, steht im Protokoll: ohne das
  // ist ein leerer Rahmen nur ein Zeitlimit.
  page.on('pageerror', e => console.log(`  seitenfehler (${benutzer}): ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') console.log(`  konsole (${benutzer}): ${m.text().slice(0, 200)}`);
  });
  return { ctx, page };
}

const bild = (page, name) => page.screenshot({ path: path.join(ZIEL, `${name}.png`) });

async function sichtbar(locator, ms = 15000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

// --- M1 reicht ein und liest in der App, wer entscheidet ---------------------
const m1 = await sitzung(M1, M1_PASS);
await m1.page.goto(`${URL}/workspace/app/${APP}`, { waitUntil: 'networkidle' });
const rahmen1 = m1.page.frameLocator(`[data-testid="app-rahmen-${APP}"]`);
if (!(await sichtbar(rahmen1.getByTestId('einreichen'), 20000))) {
  // Der Rahmen blieb leer: Bild und Adressen der Rahmen ins Protokoll, dann Schluss.
  await bild(m1.page, 'fehler-rahmen-leer');
  console.log(`ROT    Der Rahmen der App zeigt keine Seite: ${m1.page.frames().map(f => f.url()).join(' | ')}`);
  const inhalt = await m1.page.frames().at(-1)?.content();
  console.log(`  rahmeninhalt: ${(inhalt ?? '').replace(/\s+/g, ' ').slice(0, 600)}`);
  process.exit(1);
}
await rahmen1.getByTestId('einreichen').click();
const satz = rahmen1.getByTestId('wer-entscheidet');
const satzDa = await sichtbar(satz.filter({ hasText: 'Entscheidet:' }), 60000);
const satzText = satzDa ? await satz.innerText() : '';
pruefe(
  'Die App zeigt nach dem Einreichen, wer entscheidet und wo',
  satzDa &&
    satzText.includes(M2) &&
    !satzText.includes(`${M1},`) &&
    satzText.includes('in der App'),
  satzText
);
pruefe('und die Vier-Augen-Regel als Satz', satzText.includes('Vier-Augen-Prinzip'), satzText);
const tabTitel = await m1.page.title();
pruefe('Der Browser-Tab trägt den Namen der App', tabTitel.startsWith(APP_NAME), tabTitel);
await bild(m1.page, '1-m1-app-sagt-wer-entscheidet');

// J36: die Startseite von M1. Er hat nichts zu entscheiden und sieht keine
// Liste; die Statusleiste zeigt weder Fassung noch Verbindung noch Downloads.
const leiste = async page => (await page.getByTestId('workspace-statusbar').innerText()).trim();
async function startseite(page) {
  await page.goto(`${URL}/workspace/dashboard`, { waitUntil: 'networkidle' });
  await page.getByTestId('uebersicht-seite').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
}
await startseite(m1.page);
pruefe(
  'M1: die Startseite zeigt keine Freigabenliste',
  (await m1.page.getByTestId('offene-freigaben').count()) === 0 &&
    (await m1.page.locator('[data-testid^="eingereicht-"]').count()) === 0
);
const leisteM1 = await leiste(m1.page);
pruefe(
  'M1: die Statusleiste zeigt weder Fassung noch Verbindung noch Downloads',
  !/Verbunden|Verbindet|Eingeschränkt|Fassung|Stand \d|Vorserie|Modell lädt|Freigabe/.test(
    leisteM1
  ) && (await m1.page.getByTestId('statusbar-downloads').count()) === 0,
  JSON.stringify(leisteM1)
);
pruefe(
  'M1: an der Kachel steht keine Fassung',
  !(await m1.page.getByTestId('uebersicht-seite').innerText()).includes('Fassung')
);
await bild(m1.page, '2-m1-startseite-ohne-technik');

// Getrenntes Geraet: genau ein Satz. Die Gesundheitsabfrage schlaegt fehl.
await m1.page.route('**/health', r => r.abort());
await m1.page.goto(`${URL}/workspace/dashboard`, { waitUntil: 'domcontentloaded' });
const getrennt = await sichtbar(m1.page.getByTestId('statusbar-getrennt'), 20000);
const leisteGetrennt = getrennt ? await leiste(m1.page) : '';
pruefe(
  'M1: bei getrenntem Gerät steht in der Statusleiste genau ein Satz',
  getrennt && leisteGetrennt === 'Das Gerät antwortet gerade nicht.',
  JSON.stringify(leisteGetrennt)
);
await bild(m1.page, '3-m1-getrennt-ein-satz');
await m1.page.unroute('**/health');

// Kein Toast mit HTTP-Code oder englischem Backend-Text: die Liste der Apps
// antwortet mit dem Text, den das Backend ohne Uebersetzung schickt.
for (const [status, text] of [
  [500, 'Internal Server Error'],
  [403, 'Access denied'],
  [404, 'Resource not found'],
]) {
  await m1.page.route('**/api/apps/meine', r =>
    r.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'X', message: text }, timestamp: 'x' }),
    })
  );
  await m1.page.goto(`${URL}/workspace/dashboard`, { waitUntil: 'domcontentloaded' });
  const toast = m1.page.locator('[role="alert"]');
  const da = await sichtbar(toast, 15000);
  const toastText = da ? (await toast.first().innerText()).replace(/\s+/g, ' ').trim() : '';
  pruefe(
    `Kein Toast nennt HTTP ${status} oder „${text}"`,
    da && !new RegExp(`HTTP|${status}|${text.split(' ')[0]}`, 'i').test(toastText),
    JSON.stringify(toastText)
  );
  if (status === 500) await bild(m1.page, '4-m1-toast-ohne-code');
  await m1.page.unroute('**/api/apps/meine');
}

// --- Der Administrator sieht weiter alles -------------------------------------
if (ADMIN && ADMIN_PASS) {
  const adm = await sitzung(ADMIN, ADMIN_PASS);
  await startseite(adm.page);
  pruefe(
    'ADMIN: die Startseite zeigt weiter die Freigaben',
    (await sichtbar(adm.page.getByTestId('offene-freigaben'), 15000)) &&
      (await adm.page.getByTestId('offene-freigaben').innerText()).includes(APP_NAME)
  );
  const leisteAdmin = await leiste(adm.page);
  pruefe(
    'ADMIN: die Statusleiste zeigt Verbindung und Fassung',
    /Verbunden/.test(leisteAdmin) && /Stand \d|Vorserie|\d+\.\d+/.test(leisteAdmin),
    JSON.stringify(leisteAdmin)
  );
  pruefe(
    'ADMIN: die Freigaben-Zahl steht in der Statusleiste',
    await sichtbar(adm.page.getByTestId('statusbar-freigaben'), 5000)
  );
  await bild(adm.page, '5-admin-startseite-sieht-alles');
  await adm.ctx.close();
}

// --- M2: eine Zahl an der App, die Entscheidung in der App --------------------
const m2 = await sitzung(M2, M2_PASS);
await startseite(m2.page);
const zahl = m2.page.getByTestId(`uebersicht-app-${APP}-live-wartend`);
const zahlDa = await sichtbar(zahl, 15000);
pruefe(
  'M2: an der Kachel der App steht eine Zahl wartender Freigaben',
  zahlDa && /^\d+$/.test((await zahl.innerText()).trim()),
  zahlDa ? await zahl.innerText() : ''
);
pruefe(
  'M2: die Startseite zeigt keine Freigabenliste und keine Statusleiste mit Technik',
  (await m2.page.getByTestId('offene-freigaben').count()) === 0 &&
    !/Verbunden|Fassung|Freigabe/.test(await leiste(m2.page))
);
await bild(m2.page, '6-m2-startseite-zahl-an-der-app');

await m2.page.goto(`${URL}/workspace/app/${APP}`, { waitUntil: 'networkidle' });
const rahmen2 = m2.page.frameLocator(`[data-testid="app-rahmen-${APP}"]`);
const karte = rahmen2.locator('[data-testid^="freigabe-"][data-testid$="-ablehnen"]');
const karteDa = await sichtbar(karte, 30000);
pruefe('M2: in der App steht der Baustein Freigabe mit den Anfragen', karteDa);
const liste = rahmen2.getByTestId('freigabe-liste');
const karteText = karteDa ? await liste.innerText() : '';
pruefe('mit dem Namen der App, nicht der Kennung', karteText.includes(APP_NAME), '');
pruefe('mit dem Einreicher', karteText.includes(`eingereicht von ${M1}`));
pruefe('mit „wartet seit"', /wartet seit/.test(karteText));
pruefe(
  'und der Frist als Dauer',
  /noch \d+ (Minuten?|Stunden?|Tage?)|Frist abgelaufen/.test(karteText)
);
await bild(m2.page, '7-m2-app-mit-freigabe-baustein');

// Ablehnen verlangt einen Grund: erst gesperrt, dann mit Text moeglich.
// Karten vor dem Ablehnen: die Karte mit offenem Feld hat keinen Ablehnen-Knopf mehr.
const vorherAblehnen = await rahmen2.locator('[data-testid$="-ablehnen"]').count();
const ablehnen = rahmen2.locator('[data-testid$="-ablehnen"]').first();
await ablehnen.click();
const absenden = rahmen2.locator('[data-testid$="-ablehnen-absenden"]').first();
const feld = rahmen2.locator('[data-testid$="-begruendung"]').first();
await feld.waitFor({ timeout: 10000 });
pruefe('Ablehnen ohne Begründung geht nicht', await absenden.isDisabled());
await feld.fill('Probe: zu knapp vor dem Termin');
pruefe('mit Begründung geht es', await absenden.isEnabled());
await bild(m2.page, '8-m2-ablehnen-mit-pflichtgrund');
await absenden.click();
await m2.page
  .waitForFunction(
    ([id, n]) => {
      const f = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
      return (
        !!f?.contentDocument &&
        f.contentDocument.querySelectorAll('[data-testid$="-ablehnen"]').length < n
      );
    },
    [APP, vorherAblehnen],
    { timeout: 20000 }
  )
  .catch(() => {});
pruefe(
  'Die abgelehnte Karte verschwindet ohne Neuladen',
  (await rahmen2.locator('[data-testid$="-ablehnen"]').count()) < vorherAblehnen
);

// Die uebrigen werden bestaetigt, eine Karte nach der anderen.
const knoepfe = rahmen2.locator('[data-testid$="-bestaetigen"]');
for (let runde = 0; runde < 5 && (await knoepfe.count()) > 0; runde += 1) {
  const vorher = await knoepfe.count();
  await knoepfe.first().click();
  await m2.page
    .waitForFunction(
      ([id, n]) => {
        const f = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
        return (
          !!f?.contentDocument &&
          f.contentDocument.querySelectorAll('[data-testid$="-bestaetigen"]').length < n
        );
      },
      [APP, vorher],
      { timeout: 20000 }
    )
    .catch(() => {});
}
const leer = await sichtbar(
  rahmen2.locator('[data-testid="freigabe-liste"][data-leer="true"]'),
  20000
);
pruefe('Nach dem Entscheiden steht in der App die leere Zeile, ohne Neuladen', leer);
await bild(m2.page, '9-m2-app-leer-nach-entscheiden');

// --- Die Grenzen aus Sicht von M1 --------------------------------------------
if (SPERR_APP) {
  const antwort = await m1.page.goto(`${URL}/apps/${SPERR_APP}/`, { waitUntil: 'load' });
  const text = await m1.page.locator('body').innerText();
  pruefe(
    `/apps/${SPERR_APP}/ ohne Freigabe ist eine Seite mit einem Satz`,
    antwort?.status() === 403 &&
      text.includes('nicht freigegeben') &&
      !text.includes('FORBIDDEN') &&
      (await m1.page.locator('a[href="/workspace"]').count()) === 1,
    `HTTP ${antwort?.status()} ${text.replace(/\s+/g, ' ').slice(0, 100)}`
  );
  await bild(m1.page, '10-m1-app-gesperrt');
}

await m1.page.goto(`${URL}/workspace/settings`, { waitUntil: 'networkidle' });
await m1.page.getByTestId('workspace-benutzermenue').click();
const menueSatz = await sichtbar(m1.page.getByTestId('workspace-einstellungen-gesperrt'), 5000);
pruefe('Das Benutzermenü sagt, dass der Administrator die Einstellungen verwaltet', menueSatz);
await bild(m1.page, '11-m1-einstellungen-verwaltet-der-administrator');
await m1.page.keyboard.press('Escape');

if (RAHMEN_APP) {
  for (const [wer, s] of [
    [M1, m1],
    [M2, m2],
  ]) {
    await s.page.goto(`${URL}/workspace/app/${RAHMEN_APP}`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(4000);
    const mass = await s.page.evaluate(id => {
      const f = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
      if (!f) return null;
      const d = f.contentDocument;
      const r = f.getBoundingClientRect();
      const raus = [...d.querySelectorAll('body *')]
        .filter(e => e.getBoundingClientRect().right > d.documentElement.clientWidth + 1)
        .slice(0, 3)
        .map(e => `${e.tagName.toLowerCase()} r=${Math.round(e.getBoundingClientRect().right)}`);
      return {
        breite: Math.round(r.width),
        sw: d.documentElement.scrollWidth,
        cw: d.documentElement.clientWidth,
        raus,
        notizen: (
          document.querySelector('[data-panel][id="right"]') ??
          document.querySelector('[data-panel][data-panel-id="right"]')
        )?.getAttribute('data-shell-hidden'),
      };
    }, RAHMEN_APP);
    pruefe(
      `${wer}, 1440 px: die Notizen starten zu, solange ${RAHMEN_NAME || RAHMEN_APP} offen ist`,
      mass?.notizen === 'true',
      `data-shell-hidden=${mass?.notizen}`
    );
    pruefe(
      `${wer}, 1440 px: der Rahmen schneidet nichts ab`,
      mass != null && mass.sw <= mass.cw && mass.raus.length === 0,
      mass
        ? `Rahmen ${mass.breite} px, scrollWidth ${mass.sw} gegen ${mass.cw} ${mass.raus.join(', ')}`
        : 'kein Rahmen'
    );
    await bild(s.page, `12-${wer}-1440-${RAHMEN_APP}`);
  }
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `\nBrowser: ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, Bilder unter ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
