/**
 * Zurückholen im Browser (Auftrag sicherung-zurueckholen, M5, 04.10.2026).
 *
 * Gemessen wird, was ein Administrator sieht und tut, ohne Kommandozeile:
 *
 *   1. Die Stände stehen in Worten da („Heute, 23:12 Uhr“), ohne Kennung.
 *   2. (a) Die Probe-App: auswählen, den Stand A nach seinem Zeitpunkt
 *      wählen, im Dialog ein FALSCHES Passwort (der Satz steht im Dialog,
 *      nichts passiert), dann das richtige; der Bericht nennt den Stand davor
 *      und wie man rückgängig macht.
 *   3. (b) Der Probe-Bereich: derselbe Weg.
 *   4. (c) Das ganze Gerät: der Weg bis in den Dialog (Wort eingetippt),
 *      dann ABBRECHEN. Am laufenden Gerät wird das ganze Gerät nie
 *      zurückgeholt; gemessen wird es in der Wegwerf-Umgebung der Abnahme.
 *      Dass dabei kein Aufruf an /api/backup/wiederherstellung ging, wird
 *      mitgeschrieben.
 *
 * Aufruf (der Regelfall ist `sicherung-zurueckholen-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_PASSWORT=... ARASUL_STAND=<id A>
 *   ARASUL_PROBE_APP=<kennung> ARASUL_PROBE_BEREICH=<kennung>
 *   node scripts/test/sicherung-zurueckholen-bilder.mjs
 *
 * Das Passwort kommt aus der Umgebung und steht nie in einer Datei; auf den
 * Bildern ist das Feld verdeckt. Bilder unter
 * `docs/plans/audits/<datum>-sicherung-zurueckholen/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG || '';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const APP = process.env.ARASUL_PROBE_APP || '';
const BEREICH = process.env.ARASUL_PROBE_BEREICH || '';
const STAND = (process.env.ARASUL_STAND || '').slice(0, 8);
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-sicherung-zurueckholen`);
const SEITE = `${URL}/workspace/verwaltung/system/sicherung`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!SITZUNG || !fs.existsSync(SITZUNG) || !PASSWORT || !APP || !BEREICH || !STAND) {
  console.log(
    'ROT    Es fehlt etwas: ARASUL_SITZUNG, ARASUL_PASSWORT, ARASUL_PROBE_APP, ARASUL_PROBE_BEREICH, ARASUL_STAND.'
  );
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG,
  viewport: { width: 1440, height: 1000 },
});
const seite = await ctx.newPage();
const geraetAufrufe = [];
seite.on('request', r => {
  if (r.method() === 'POST' && /\/api\/backup\/wiederherstellung$/.test(r.url())) {
    geraetAufrufe.push(r.url());
  }
});
const steht = (waehler, grenze = 30000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);
const bild = name => seite.screenshot({ path: path.join(ZIEL, `${name}.png`), fullPage: true });

/** Was, welches Ziel, welcher Stand -- bis der Dialog offen ist. */
async function waehle(was, ziel) {
  await seite.locator(`[data-testid="zurueck-was-${was}"]`).click();
  if (ziel) {
    await seite.locator('[data-testid="zurueck-ziel"]').click();
    await seite.locator(`[data-testid="zurueck-ziel-${ziel}"]`).click();
  }
  const stand = seite.locator(`[data-testid="zurueck-stand-${STAND}"]`);
  const da = await stand
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  pruefe(`${was}: Stand A steht zur Wahl`, da);
  if (!da) return false;
  const text = await stand.innerText();
  pruefe(
    `${was}: der Stand heißt nach Datum und Uhrzeit, ohne Kennung`,
    /Uhr/.test(text) && !text.includes(STAND),
    text.replace(/\s+/g, ' ')
  );
  await stand.click();
  await seite.locator('[data-testid="zurueck-weiter"]').click();
  return steht('[data-testid="zurueck-dialog-text"]', 10000);
}

/** Passwort, absenden, auf den Bericht warten. Gibt die Sekunden zurück. */
async function bestaetige(was) {
  await seite.locator('[data-testid="zurueck-passwort"]').fill(PASSWORT);
  const beginn = Date.now();
  await seite.locator('[data-testid="zurueck-absenden"]').click();
  const kam = await seite
    .locator('[data-testid="zurueck-bericht"]')
    .waitFor({ timeout: 40 * 60_000 })
    .then(() => true)
    .catch(() => false);
  const sekunden = Math.round((Date.now() - beginn) / 1000);
  pruefe(`${was}: ein stehender Bericht erscheint`, kam, `${sekunden} s`);
  if (!kam) return sekunden;
  const bericht = await seite.locator('[data-testid="zurueck-bericht"]').innerText();
  const kreuze = await seite
    .locator('[data-testid="zurueck-saetze"] [aria-label="gescheitert"]')
    .count();
  pruefe(`${was}: kein Schritt ist gescheitert`, kreuze === 0, bericht.replace(/\s+/g, ' ').slice(0, 220));
  pruefe(`${was}: der Bericht nennt den Stand davor`, /vorher gesichert/.test(bericht));
  pruefe(
    `${was}: und wie man rückgängig macht, mit dem Zeitpunkt in Worten`,
    /Rückgängig machen: Wählen Sie den Stand „Heute, \d+:\d\d Uhr“/.test(bericht)
  );
  await bild(`${was}-bericht`);
  return sekunden;
}

try {
  await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  pruefe('Die Seite Sicherung steht (Verwaltung → System → Sicherung)', await steht('[data-testid="sicherung-seite"]'));
  pruefe('Der Abschnitt Zurückholen steht darauf, an genau einer Stelle', (await seite.locator('[data-testid="zurueckholen"]').count()) === 1);
  await steht('[data-testid="staende-liste"]', 20000);
  const liste = await seite.locator('[data-testid="staende-liste"]').innerText();
  pruefe('Die Stände stehen in Worten da, ohne Kennung', /(Heute|Gestern), \d+:\d\d Uhr/.test(liste) && !/[0-9a-f]{8}/.test(liste), liste.split('\n').slice(0, 3).join(' | '));
  await bild('staende');

  // (a) Die App, mit einem falschen Passwort zuerst.
  if (await waehle('app', APP)) {
    await bild('app-dialog');
    await seite.locator('[data-testid="zurueck-passwort"]').fill('falsch-und-nicht-das-richtige');
    await seite.locator('[data-testid="zurueck-absenden"]').click();
    const fehler = await steht('[data-testid="zurueck-fehler"]', 30000);
    pruefe(
      'app: ein falsches Passwort steht als Satz im Dialog',
      fehler && /Passwort stimmt nicht/.test(await seite.locator('[data-testid="zurueck-fehler"]').innerText())
    );
    await bild('app-falsches-passwort');
    const sekunden = await bestaetige('app');
    console.log(`DAUER app=${sekunden}`);
  }

  // (b) Der Bereich.
  if (await waehle('bereich', BEREICH)) {
    await bild('bereich-dialog');
    const sekunden = await bestaetige('bereich');
    console.log(`DAUER bereich=${sekunden}`);
  }

  // (c) Das ganze Gerät: nur der Weg, dann abbrechen.
  await seite.locator('[data-testid="zurueck-was-geraet"]').click();
  pruefe('geraet: die Warnung steht da', await steht('[data-testid="zurueck-geraet-warnung"]', 5000));
  if (await waehle('geraet', null)) {
    await seite.locator('[data-testid="zurueck-wort"]').fill('wiederherstellen');
    pruefe(
      'geraet: ohne Passwort bleibt „Alles ersetzen“ gesperrt',
      await seite.locator('[data-testid="zurueck-absenden"]').isDisabled()
    );
    await bild('geraet-dialog');
    await seite.getByRole('button', { name: 'Abbrechen' }).click();
  }
  pruefe('geraet: am laufenden Gerät ging kein Aufruf an /api/backup/wiederherstellung', geraetAufrufe.length === 0);

  // Schmal (390 px): derselbe Weg bricht um, statt zu überlaufen.
  await seite.setViewportSize({ width: 390, height: 900 });
  await seite.locator('[data-testid="zurueck-was-app"]').click();
  await seite.waitForTimeout(500);
  const breite = await seite.evaluate(() => document.documentElement.scrollWidth);
  pruefe('390 px: nichts läuft seitlich über', breite <= 392, `${breite} px`);
  await bild('schmal');
} finally {
  await browser.close();
}
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
