/**
 * Der Browser-Teil der Abnahme „Live schalten mit Sicherung" (M5, 04.10.2026).
 * Gerufen von `live-schalten-abnahme.sh` mit dem Zustand, den das Skript
 * gerade hergestellt hat:
 *
 *   kaputt  Im Test steht eine Fassung, deren Strukturänderung auf den
 *           Live-Daten scheitert. Der Admin sieht am Teststand und im Dialog,
 *           was der Entwickler dazu schrieb, schaltet live, und das Gerät
 *           schaltet selbst zurück: ein Satz in der Karte des Livestands, ein
 *           zweiter, was zu tun ist, die Technik nur aufgeklappt.
 *   gut     Die korrigierte Fassung: Dialog mit ihrem Text, live, kein Hinweis.
 *
 * Die Sitzung kommt als Datei (arasul_sitzung_bauen), kein Passwort. Bilder
 * unter docs/plans/audits/<tag>-live-schalten/.
 *
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_PROBE_APP=<kennung> \
 *   ARASUL_NEU=<fassung im test> ARASUL_ALT=<fassung live> ARASUL_TEXT=<aenderungstext> \
 *   node scripts/test/live-schalten-bilder.mjs kaputt|gut
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG || '';
const APP = process.env.ARASUL_PROBE_APP || '';
const NEU = process.env.ARASUL_NEU || '';
const ALT = process.env.ARASUL_ALT || '';
const TEXT = process.env.ARASUL_TEXT || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-live-schalten`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (
  !SITZUNG ||
  !fs.existsSync(SITZUNG) ||
  !APP ||
  !NEU ||
  !ALT ||
  !['kaputt', 'gut'].includes(PHASE)
) {
  console.log(
    'ROT    Es fehlt etwas: ARASUL_SITZUNG, ARASUL_PROBE_APP, ARASUL_NEU, ARASUL_ALT, Phase.'
  );
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG,
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log(`  seitenfehler: ${e.message}`));
const bild = (name, ganz = true) =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: ganz });
const sichtbar = (locator, ms = 20000) =>
  locator
    .first()
    .waitFor({ state: 'visible', timeout: ms })
    .then(() => true)
    .catch(() => false);
const text = locator =>
  locator
    .first()
    .innerText()
    .catch(() => '');

try {
  await page.goto(`${URL}/workspace/verwaltung/apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const knopf = page.getByTestId(`app-oeffnen-${APP}`);
  if (await sichtbar(knopf)) await knopf.click();
  pruefe(
    'Die Ansicht der App ist da (Verwaltung → Apps)',
    await sichtbar(page.getByTestId('stand-test'))
  );
  pruefe(
    `Teststand ${NEU}, Livestand ${ALT}`,
    (await text(page.getByTestId('version-test'))) === NEU &&
      (await text(page.getByTestId('version-live'))) === ALT
  );
  if (TEXT) {
    pruefe(
      'Am Teststand steht, was der Entwickler zur Fassung schrieb',
      (await text(page.getByTestId('aenderungstext-test'))).includes(TEXT)
    );
  }
  await bild('staende-vorher');

  await page.getByTestId('schalten-live').click();
  const dialog = page.getByTestId('live-schalten-dialog');
  pruefe('„Live schalten" fragt erst', await sichtbar(dialog, 10000));
  if (TEXT) {
    pruefe(
      'Im Dialog steht der Änderungstext',
      (await text(page.getByTestId('live-schalten-aenderungstext'))).includes(TEXT)
    );
  }
  pruefe(
    'Der Dialog sagt, dass vorher gesichert wird',
    /Vorher sichert Arasul die Daten/.test(await text(dialog))
  );
  await page.waitForTimeout(400);
  await bild('dialog', false);

  const beginn = Date.now();
  await page.getByTestId('live-schalten-bestaetigen').click();
  await page.waitForTimeout(2500);
  pruefe(
    'Solange es läuft, sagt der Knopf es',
    /Sichert und schaltet/.test(await text(page.getByTestId('live-schalten-bestaetigen')))
  );
  await bild('laeuft', false);
  // Der Dialog schließt sich, wenn die Antwort da ist.
  await dialog.waitFor({ state: 'detached', timeout: 20 * 60_000 }).catch(() => {});
  const sekunden = Math.round((Date.now() - beginn) / 1000);
  console.log(`DAUER ${PHASE}=${sekunden}`);

  if (PHASE === 'kaputt') {
    const hinweis = page.getByTestId('schaltung-hinweis');
    pruefe(
      'In der Karte des Livestands steht, was geschah',
      await sichtbar(hinweis, 60000),
      `${sekunden} s`
    );
    const satz = await text(page.getByTestId('schaltung-satz'));
    pruefe(
      'Ein Satz: die neue Fassung startete nicht, die alte läuft mit den Daten von vorher',
      satz.includes(NEU) &&
        satz.includes(ALT) &&
        /Daten von vorher/.test(satz) &&
        (satz.match(/\. /g) || []).length === 0,
      satz
    );
    const hilfe = await text(page.getByTestId('schaltung-hilfe'));
    pruefe('Der zweite Satz sagt, was er tun kann', /Entwickler|erneut/.test(hilfe), hilfe);
    pruefe(
      'Der Livestand steht wieder auf der Fassung von vorher',
      (await text(page.getByTestId('version-live'))) === ALT
    );
    pruefe(
      'Die Technik ist zugeklappt',
      !(await page
        .getByText('Letzte Zeilen')
        .isVisible()
        .catch(() => false))
    );
    await page.getByTestId('stand-live').scrollIntoViewIfNeeded();
    await bild('zurueckgeschaltet');
    await page.getByTestId('schaltung-technik-knopf').click();
    const technik = page.getByTestId('schaltung-technik');
    await page.waitForTimeout(400);
    const t = await text(technik);
    pruefe(
      'Aufgeklappt: Grund, Stand der Sicherung und die letzten Zeilen der Fassung',
      /Grund/.test(t) && /Stand der Sicherung/.test(t) && /gescheitert/.test(t),
      t.replace(/\s+/g, ' ').slice(0, 200)
    );
    await bild('technik');
  } else {
    await page.waitForTimeout(1500);
    pruefe(
      'Die neue Fassung ist live',
      (await text(page.getByTestId('version-live'))) === NEU,
      `${sekunden} s`
    );
    pruefe(
      'Kein Hinweis in der Karte des Livestands',
      !(await page
        .getByTestId('schaltung-hinweis')
        .isVisible()
        .catch(() => false))
    );
    if (TEXT) {
      pruefe(
        'Der Text des Entwicklers ist mit in den Livestand gewandert',
        (await text(page.getByTestId('aenderungstext-live'))).includes(TEXT)
      );
    }
    await bild('live');
  }
} catch (fehler) {
  pruefe('Der Browser-Teil lief durch', false, fehler.message);
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
