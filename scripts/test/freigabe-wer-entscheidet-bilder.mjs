/**
 * Der Browser-Teil der Abnahme „Freigabe sagt, wer entscheidet" (J35,
 * 26.09.2026). Gerufen von `freigabe-wer-entscheidet-abnahme.sh`, die die
 * Proben-App einspielt und danach wieder entfernt.
 *
 * Zwei Menschen, dieselbe Freigabe von beiden Seiten:
 *
 *   M1 reicht in der Proben-App ein und liest dort, wer entscheidet (der Satz
 *      kommt aus `freigabe.satz` des Geraets); auf seiner Uebersicht steht
 *      „Ihr Vorgang … wartet … auf …", und selbst entscheiden kann er nicht.
 *   M2 sieht die Karte: App-Name statt Kennung, Einreicher, „wartet seit",
 *      die Vier-Augen-Regel als Satz, und bestaetigt. Danach steht bei ihm die
 *      leere Zeile.
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
  console.log('ROT    ARASUL_M1/_PASSWORT und ARASUL_M2/_PASSWORT fehlen -- der Aufrufer setzt sie.');
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
await rahmen1.getByTestId('einreichen').click();
const satz = rahmen1.getByTestId('wer-entscheidet');
const satzDa = await sichtbar(satz.filter({ hasText: 'Entscheidet:' }), 60000);
const satzText = satzDa ? await satz.innerText() : '';
pruefe(
  'Die App zeigt nach dem Einreichen, wer entscheidet und wo',
  satzDa && satzText.includes(M2) && !satzText.includes(`${M1},`) && satzText.includes('Übersicht'),
  satzText
);
pruefe('und die Vier-Augen-Regel als Satz', satzText.includes('Vier-Augen-Prinzip'), satzText);
const tabTitel = await m1.page.title();
pruefe('Der Browser-Tab trägt den Namen der App', tabTitel.startsWith(APP_NAME), tabTitel);
await bild(m1.page, '1-m1-app-sagt-wer-entscheidet');

// Die Übersicht von M1: nichts zu entscheiden, aber sein Vorgang mit dem Kreis.
await m1.page.goto(`${URL}/workspace/dashboard`, { waitUntil: 'networkidle' });
const eingereicht = m1.page.locator('[data-testid^="eingereicht-"]');
const eingereichtDa = await sichtbar(eingereicht);
const eingereichtText = eingereichtDa ? await eingereicht.first().innerText() : '';
pruefe(
  'M1 sieht auf der Übersicht, bei wem sein Vorgang liegt',
  eingereichtDa && eingereichtText.includes(M2) && eingereichtText.includes(APP_NAME),
  eingereichtText
);
pruefe(
  'und hat selbst nichts zu entscheiden',
  (await m1.page.locator('[data-testid="offene-freigaben"][data-leer="true"]').count()) === 1
);
await bild(m1.page, '2-m1-uebersicht-eingereicht');

// --- M2 sieht die Karte und bestätigt ----------------------------------------
const m2 = await sitzung(M2, M2_PASS);
await m2.page.goto(`${URL}/workspace/dashboard`, { waitUntil: 'networkidle' });
const karte = m2.page.locator('[data-testid^="freigabe-"][data-testid$="-regel"]');
const karteDa = await sichtbar(karte);
const liste = m2.page.getByTestId('offene-freigaben');
const karteText = karteDa ? await liste.innerText() : '';
pruefe('M2 sieht die Karte mit dem Namen der App, nicht der Kennung', karteText.includes(APP_NAME), '');
pruefe('mit dem Einreicher', karteText.includes(`eingereicht von ${M1}`));
pruefe('mit „wartet seit"', /wartet seit/.test(karteText));
pruefe(
  'und der Vier-Augen-Regel als Satz',
  karteDa && (await karte.first().innerText()).includes(`${M1} hat eingereicht und entscheidet nicht mit`)
);
await bild(m2.page, '3-m2-freigabekarte');

const bestaetigen = m2.page.locator('[data-testid$="-bestaetigen"]').first();
await bestaetigen.click();
const leer = await sichtbar(m2.page.locator('[data-testid="offene-freigaben"][data-leer="true"]'), 20000);
pruefe('Nach dem Bestätigen steht bei M2 die leere Zeile, ohne Neuladen', leer);
await bild(m2.page, '4-m2-leer-nach-bestaetigen');

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
  await bild(m1.page, '5-m1-app-gesperrt');
}

await m1.page.goto(`${URL}/workspace/settings`, { waitUntil: 'networkidle' });
await m1.page.getByTestId('workspace-benutzermenue').click();
const menueSatz = await sichtbar(m1.page.getByTestId('workspace-einstellungen-gesperrt'), 5000);
pruefe('Das Benutzermenü sagt, dass der Administrator die Einstellungen verwaltet', menueSatz);
await bild(m1.page, '6-m1-einstellungen-verwaltet-der-administrator');
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
        notizen: (document.querySelector('[data-panel][id="right"]') ?? document.querySelector('[data-panel][data-panel-id="right"]'))?.getAttribute('data-shell-hidden'),
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
      mass ? `Rahmen ${mass.breite} px, scrollWidth ${mass.sw} gegen ${mass.cw} ${mass.raus.join(', ')}` : 'kein Rahmen'
    );
    await bild(s.page, `7-${wer}-1440-${RAHMEN_APP}`);
  }
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\nBrowser: ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, Bilder unter ${path.relative(WURZEL, ZIEL)}`);
process.exit(rot === 0 ? 0 : 1);
