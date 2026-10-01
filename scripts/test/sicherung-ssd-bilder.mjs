/**
 * Die Sicherung im Browser: Datentraeger mit Namen und freiem Platz, und eine
 * Probe-App, die mit doppelter Bestaetigung zurueckgeholt wird (J37).
 *
 * Gemessen wird, was ein Kanzlei-Admin sieht und tut -- ohne Kommandozeile:
 *
 *   1. Die Seite „Sicherung" nennt den NAMEN des angesteckten Datentraegers und
 *      seinen FREIEN PLATZ, und der interne Pfad /arasul/extern steht nirgends.
 *   2. „Eine App zurueckholen": die Probe-App steht in der Liste (von dem
 *      Datentraeger), der Knopf oeffnet einen Dialog; ohne die Kennung ist der
 *      Absende-Knopf gesperrt (ZWEITE Bestaetigung), mit ihr geht er.
 *   3. Danach steht ein Bericht mit Haken: Daten, Paket, App laeuft wieder.
 *
 * Aufruf (der Regelfall ist `sicherung-ssd-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_DATENTRAEGER=<Name> \
 *   ARASUL_PROBE_APP=<Kennung> node scripts/test/sicherung-ssd-bilder.mjs
 *
 * Ohne ARASUL_PROBE_APP wird nur Teil 1 gemessen. Bilder unter
 * `docs/plans/audits/<datum>-sicherung-j37/`. Rueckgabe 0, wenn alles gruen war.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG || '';
const DATENTRAEGER = process.env.ARASUL_DATENTRAEGER || '';
const APP = process.env.ARASUL_PROBE_APP || '';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-sicherung-j37`);
const SEITE = `${URL}/workspace/settings?tab=sicherung`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!SITZUNG || !fs.existsSync(SITZUNG)) {
  console.log('ROT    Keine Sitzung unter ARASUL_SITZUNG -- der Aufrufer baut sie.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG,
  viewport: { width: 1440, height: 900 },
});
const seite = await ctx.newPage();
const steht = (waehler, grenze = 30000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

try {
  await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  pruefe('Die Seite Sicherung steht', await steht('[data-testid="sicherung-seite"]'));
  await seite.waitForTimeout(2500);
  const text = await seite.locator('[data-testid="sicherung-seite"]').innerText();

  if (DATENTRAEGER) {
    pruefe('Die Seite nennt den Namen des Datentraegers', text.includes(DATENTRAEGER), DATENTRAEGER);
    pruefe(
      'und seinen freien Platz',
      /\d+([.,]\d+)?\s?(B|KB|MB|GB|TB)\s+frei/i.test(text),
      (text.match(/[^\n]*frei[^\n]*/i) || [''])[0].slice(0, 100)
    );
  }
  pruefe('Der interne Pfad /arasul/extern steht nirgends', !text.includes('/arasul/extern'));
  await seite.screenshot({ path: path.join(ZIEL, 'sicherung-datentraeger.png'), fullPage: true });

  if (APP) {
    // Quelle: der Datentraeger (die Vorgabe, wenn einer steckt).
    const zeile = seite.locator(`[data-testid="app-zurueck-${APP}"]`);
    pruefe('Die Probe-App steht in der Liste „Eine App zurueckholen"', await steht(`[data-testid="app-zurueck-${APP}"]`, 20000));
    await seite.locator(`[data-testid="app-zurueckholen-${APP}"]`).click();
    const absenden = seite.locator('[data-testid="app-zurueckholen-absenden"]');
    pruefe('Der Dialog oeffnet sich', await steht('[data-testid="app-zurueckholen-text"]', 10000));
    pruefe('Erste Bestaetigung gelesen, aber ohne Kennung ist der Knopf gesperrt', await absenden.isDisabled());
    await seite.screenshot({ path: path.join(ZIEL, 'zurueckholen-dialog.png') });
    await seite.locator('[data-testid="app-zurueckholen-kennung"]').fill('falsch');
    pruefe('Mit falscher Kennung bleibt er gesperrt', await absenden.isDisabled());
    await seite.locator('[data-testid="app-zurueckholen-kennung"]').fill(APP);
    pruefe('Mit der Kennung der App geht er auf (zweite Bestaetigung)', await absenden.isEnabled());
    await absenden.click();
    const bericht = seite.locator('[data-testid="app-zurueck-bericht"]');
    const kam = await bericht
      .waitFor({ timeout: 25 * 60_000 })
      .then(() => true)
      .catch(() => false);
    pruefe('Ein stehender Bericht erscheint', kam);
    if (kam) {
      const saetze = await seite.locator('[data-testid="app-zurueck-saetze"] > li').allInnerTexts();
      pruefe('Der Bericht nennt die Daten', saetze.some(s => /Daten/.test(s)), saetze.join(' | ').slice(0, 160));
      pruefe('... das Paket', saetze.some(s => /Paket/.test(s)));
      pruefe('... und dass die App wieder laeuft', saetze.some(s => /l(ä|ae)uft wieder/.test(s)));
      const gescheitert = await seite.locator('[data-testid="app-zurueck-saetze"] [aria-label="gescheitert"]').count();
      pruefe('Kein Schritt ist gescheitert', gescheitert === 0, `${gescheitert} Kreuz(e)`);
      await seite.screenshot({ path: path.join(ZIEL, 'zurueckholen-bericht.png'), fullPage: true });
    }
    void zeile;
  }
} finally {
  await browser.close();
}
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
