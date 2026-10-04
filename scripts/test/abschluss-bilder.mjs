/**
 * Der Browser-Teil der Abnahme „Abschluss ueber die App" (M5, 04.10.2026).
 * Gerufen von `abschluss-abnahme.sh` mit dem Zustand, den das Skript gerade
 * hergestellt hat:
 *
 *   nicht-uebergeben  Die Laeufe-Ansicht der App zeigt den Lauf als „nicht
 *                     übergeben" mit dem Knopf „erneut"; der Lauf selbst nennt
 *                     Route, Versuche und Grund und hat denselben Knopf.
 *   uebergeben        Derselbe Lauf nach „erneut": „fertig", die Uebergabe mit
 *                     Zeitpunkt, kein Knopf mehr.
 *
 * Passwoerter nur aus der Umgebung. Bilder unter
 * docs/plans/audits/<tag>-flow-abschluss/.
 *
 *   node scripts/test/abschluss-bilder.mjs <phase>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const APP = process.env.ARASUL_ABSCHLUSS_APP || '';
const LAUF = process.env.ARASUL_LAUF || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-flow-abschluss`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !APP || !LAUF) {
  console.log('ROT    Konto, Passwort, ARASUL_ABSCHLUSS_APP oder ARASUL_LAUF fehlen.');
  process.exit(1);
}
if (ADMIN === 'admin') {
  console.log('ROT    Nie das Konto admin.');
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
const r = await ctx.request.post(`${URL}/api/auth/login`, {
  data: { username: ADMIN, password: ADMIN_PASS },
});
if (r.status() !== 200) {
  pruefe(`${ADMIN} meldet sich im Browser an`, false, `HTTP ${r.status()}`);
}
const page = await ctx.newPage();
page.on('pageerror', e => console.log(`  seitenfehler: ${e.message}`));

const bild = name =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: true });

async function sichtbar(locator, ms = 20000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

async function appOeffnen() {
  await page.goto(`${URL}/workspace/verwaltung/apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const knopf = page.getByTestId(`app-oeffnen-${APP}`);
  if (await sichtbar(knopf)) await knopf.click();
  return sichtbar(page.getByTestId('lauf-liste'));
}

if (PHASE === 'nicht-uebergeben') {
  pruefe('Die Laeufe-Ansicht der App ist da', await appOeffnen());
  const zeile = page.getByTestId(`lauf-oeffnen-${LAUF}`);
  pruefe('Der Lauf steht in der Liste', await sichtbar(zeile, 15000));
  pruefe(
    'Zustand „nicht übergeben"',
    ((await zeile.innerText().catch(() => '')) || '').includes('nicht übergeben')
  );
  pruefe(
    'mit dem Knopf „erneut" in der Liste',
    await sichtbar(page.getByTestId(`lauf-erneut-${LAUF}`), 5000)
  );
  await page.getByTestId('lauf-liste').scrollIntoViewIfNeeded();
  await bild('laeufe-ansicht');
  await zeile.click();
  pruefe('Der Lauf in der Verwaltung ist da', await sichtbar(page.getByTestId('lauf-ansicht')));
  const uebergabe = page.getByTestId('lauf-uebergabe');
  pruefe(
    'Route und Versuche stehen am Lauf',
    await sichtbar(uebergabe, 10000),
    (await uebergabe.innerText().catch(() => '')).trim()
  );
  pruefe('Der Grund steht dabei', await sichtbar(page.getByTestId('lauf-grund'), 5000));
  pruefe('und der Knopf „erneut"', await sichtbar(page.getByTestId(`lauf-erneut-${LAUF}`), 5000));
  await bild('lauf');
} else if (PHASE === 'uebergeben') {
  pruefe('Die Laeufe-Ansicht der App ist da', await appOeffnen());
  const zeile = page.getByTestId(`lauf-oeffnen-${LAUF}`);
  pruefe('Der Lauf steht in der Liste', await sichtbar(zeile, 15000));
  pruefe(
    'Zustand „fertig", kein Knopf „erneut"',
    ((await zeile.innerText().catch(() => '')) || '').includes('fertig') &&
      (await page.getByTestId(`lauf-erneut-${LAUF}`).count()) === 0
  );
  await page.getByTestId('lauf-liste').scrollIntoViewIfNeeded();
  await bild('laeufe-ansicht');
  await zeile.click();
  const uebergabe = page.getByTestId('lauf-uebergabe');
  pruefe(
    'Die Uebergabe steht mit Zeitpunkt am Lauf',
    await sichtbar(uebergabe, 15000),
    (await uebergabe.innerText().catch(() => '')).trim()
  );
  pruefe('Kein Grund mehr', (await page.getByTestId('lauf-grund').count()) === 0);
  await bild('lauf');
} else {
  console.log(`ROT    Phase "${PHASE}" gibt es nicht (nicht-uebergeben, uebergeben).`);
  process.exit(1);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `Bilder (${PHASE}): ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, unter ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
