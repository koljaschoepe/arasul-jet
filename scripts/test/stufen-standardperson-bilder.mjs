/**
 * Der Browser-Teil der Abnahme „Stufen mit Standardperson" (M5, 04.10.2026).
 * Gerufen von `stufen-standardperson-abnahme.sh` an drei Stellen, jedes Mal
 * mit dem Zustand, den das Skript gerade hergestellt hat:
 *
 *   pruefung    Die Freigabe der Stufe Prüfung liegt bei B. B sieht sie unter
 *               „Für Sie", die Zahl am Haus ist 1. Der Administrator sieht sie
 *               unter „Für Sie" NICHT, aber zugeklappt unter „bei anderen" mit
 *               „Übernehmen". A hat eingereicht und sieht nur, bei wem sie liegt.
 *   verwaltung  Die Seite der App in der Verwaltung: Prüfung hat B, Leitung
 *               keine Standardperson, und dazu steht der Hinweis.
 *   alle        Die Freigabe der Stufe Leitung liegt ohne Standardperson bei
 *               allen mit Zugang: der Administrator sieht sie mit dem Hinweis
 *               auf die Verwaltung, B ebenso (ohne Hinweis), A nicht.
 *
 * Passwoerter nur aus der Umgebung, nie aus einer Datei. Bilder unter
 * docs/plans/audits/<tag>-stufen-standardperson/.
 *
 *   node scripts/test/stufen-standardperson-bilder.mjs <phase>
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
const B_IST_ADMIN = process.env.ARASUL_B_ROLLE === 'admin';
const APP = process.env.ARASUL_STUFEN_APP || '';
const LAUF_TITEL = process.env.ARASUL_STUFEN_TITEL || '';
// Der Tag in Ortszeit: kurz nach Mitternacht gaebe `toISOString` den Vortag (UTC).
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-stufen-standardperson`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !A || !A_PASS || !B || !B_PASS || !APP) {
  console.log('ROT    Konten, Passwoerter oder ARASUL_STUFEN_APP fehlen -- der Aufrufer setzt sie.');
  process.exit(1);
}
if ([ADMIN, A, B].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
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

/** Die Startseite eines Menschen, bis „Für Sie" steht. */
async function startseite(page) {
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sichtbar(page.getByTestId('offene-freigaben'));
  // Die Zahl am Haus kommt aus derselben Abfrage; einen Atemzug fuer React.
  await page.waitForTimeout(800);
}

async function hausZahl(page) {
  const zahl = page.getByTestId('leiste-freigaben-zahl');
  return (await zahl.count()) > 0 ? (await zahl.innerText()).trim() : '0';
}

/** Die Karten unter „Für Sie" mit dem Titel des Laufs. */
const karten = page =>
  page.getByTestId('fuer-sie').locator('article').filter({ hasText: LAUF_TITEL });

if (PHASE === 'pruefung') {
  const b = await sitzung(B, B_PASS);
  await startseite(b.page);
  const kartenB = karten(b.page);
  pruefe(
    `${B} sieht die Freigabe der Stufe Prüfung unter „Für Sie"`,
    await sichtbar(kartenB, 10000),
    LAUF_TITEL
  );
  const textB = (await b.page.getByTestId('offene-freigaben').innerText()).replace(/\s+/g, ' ');
  pruefe('mit Stufe und „Liegt bei Ihnen"', /Stufe Prüfung/.test(textB) && /Liegt bei Ihnen/.test(textB));
  const zahlB = await hausZahl(b.page);
  const fuerSieB = await b.page.getByTestId('fuer-sie').locator('> li').count();
  pruefe('Die Zahl am Haus zählt genau „Für Sie"', zahlB === String(fuerSieB), `haus=${zahlB} liste=${fuerSieB}`);
  await bild(b.page, `${B}-startseite`);
  await b.ctx.close();

  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await startseite(ad.page);
  pruefe(
    `${ADMIN} sieht sie nicht unter „Für Sie"`,
    (await ad.page.getByTestId('fuer-sie').locator('article').filter({ hasText: LAUF_TITEL }).count()) === 0
  );
  const schalter = ad.page.getByTestId('freigaben-bei-anderen-schalter');
  const daSchalter = await sichtbar(schalter, 10000);
  if (daSchalter) await schalter.click();
  const zeile = ad.page.locator('[data-testid^="bei-anderen-"]').filter({ hasText: LAUF_TITEL });
  pruefe(
    `aber aufgeklappt unter „bei anderen", liegt bei ${B}, mit „Übernehmen"`,
    daSchalter &&
      (await sichtbar(zeile, 5000)) &&
      (await zeile.first().innerText()).includes(`liegt bei ${B}`) &&
      (await zeile.first().getByRole('button', { name: 'Übernehmen' }).count()) === 1
  );
  const zahlAd = await hausZahl(ad.page);
  const fuerSieAd = await ad.page.getByTestId('fuer-sie').locator('> li').count();
  pruefe('Auch beim Administrator zählt das Haus nur „Für Sie"', zahlAd === String(fuerSieAd), `haus=${zahlAd} liste=${fuerSieAd}`);
  await bild(ad.page, `${ADMIN}-startseite`);
  await ad.ctx.close();

  const a = await sitzung(A, A_PASS);
  await startseite(a.page);
  pruefe(
    `${A} (Einreicher) sieht sie nicht unter „Für Sie"`,
    (await a.page.locator('article').filter({ hasText: LAUF_TITEL }).count()) === 0
  );
  const eingereicht = a.page.getByTestId('eingereichte-freigaben');
  pruefe(
    `und liest, dass sein Vorgang bei ${B} liegt`,
    (await sichtbar(eingereicht, 10000)) && (await eingereicht.innerText()).includes(`bei ${B}`)
  );
  await bild(a.page, `${A}-startseite`);
  await a.ctx.close();
} else if (PHASE === 'verwaltung') {
  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await ad.page.goto(`${URL}/workspace/verwaltung/apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const knopf = ad.page.getByTestId(`app-oeffnen-${APP}`);
  if (await sichtbar(knopf)) await knopf.click();
  const liste = ad.page.getByTestId('stufen-liste');
  pruefe('Die Seite der App zeigt den Abschnitt Freigabestufen', await sichtbar(liste));
  pruefe(
    `Prüfung: Standardperson ${B}`,
    (await ad.page.getByTestId('stufe-pruefung-person').innerText()).includes(B)
  );
  pruefe(
    'Leitung: keine Standardperson, „alle mit Zugang"',
    (await ad.page.getByTestId('stufe-leitung-person').innerText()).includes('alle mit Zugang')
  );
  const hinweis = ad.page.getByTestId('stufe-leitung-hinweis');
  pruefe(
    'und der Hinweis, dass neue Freigaben bei allen mit Zugang liegen',
    (await sichtbar(hinweis, 5000)) && (await hinweis.innerText()).includes('bei allen mit Zugang')
  );
  pruefe('Prüfung trägt keinen Hinweis', (await ad.page.getByTestId('stufe-pruefung-hinweis').count()) === 0);
  await liste.scrollIntoViewIfNeeded();
  await bild(ad.page, 'app-seite');
  await ad.ctx.close();
} else if (PHASE === 'alle') {
  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await startseite(ad.page);
  const karteAd = karten(ad.page);
  pruefe(`${ADMIN} sieht die Freigabe der Stufe Leitung unter „Für Sie"`, await sichtbar(karteAd, 10000));
  const li = ad.page.getByTestId('fuer-sie').locator('> li').filter({ hasText: LAUF_TITEL });
  const zeileText = (await li.first().innerText()).replace(/\s+/g, ' ');
  pruefe(
    'mit „Liegt bei allen mit Zugang" und dem Hinweis auf die Verwaltung',
    zeileText.includes('Liegt bei allen mit Zugang') && zeileText.includes('Keine Standardperson'),
    zeileText.slice(0, 160)
  );
  await bild(ad.page, `${ADMIN}-startseite`);
  await ad.ctx.close();

  const b = await sitzung(B, B_PASS);
  await startseite(b.page);
  const liB = b.page.getByTestId('fuer-sie').locator('> li').filter({ hasText: LAUF_TITEL });
  pruefe(`${B} sieht sie ebenso`, await sichtbar(liB, 10000));
  if (!B_IST_ADMIN) {
    pruefe(
      'ohne Verwaltungshinweis (er ist kein Administrator)',
      !(await liB.first().innerText()).includes('Keine Standardperson')
    );
  }
  await bild(b.page, `${B}-startseite`);
  await b.ctx.close();
} else {
  console.log(`ROT    Phase "${PHASE}" gibt es nicht (pruefung, verwaltung, alle).`);
  process.exit(1);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`Bilder (${PHASE}): ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, unter ${path.relative(WURZEL, ZIEL)}`);
process.exit(rot === 0 ? 0 : 1);
