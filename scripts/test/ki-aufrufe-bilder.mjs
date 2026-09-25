/**
 * Die KI-Aufrufe einer App im Browser des Administrators (J35, 26.09.2026).
 *
 * Der Auftrag ist erst fertig, wenn der Aufruf dort steht, wo ein Mensch ihn
 * liest: Einstellungen -> Apps -> die App -> KI-Aufrufe, mit App, Mensch,
 * Modell und Dauer -- und ohne den Inhalt der Datei. Die Schnittstelle misst
 * `ki-aufrufe-abnahme.sh`; hier steht die Frage, ob die Oberflaeche dasselbe
 * sagt, und das Bild ist der Beleg.
 *
 * KEINE EIGENE ANMELDUNG: der Aufrufer legt die Sitzung als `storageState` ab
 * (`arasul_sitzung_bauen`).
 *
 * Aufruf (der Regelfall ist ueber `ki-aufrufe-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG_ADMIN=... ARASUL_APP=probe-ki \
 *   ARASUL_JOB=<uuid> ARASUL_MENSCH=<name> ARASUL_MODELL=<id> \
 *   ARASUL_VERBOTEN='text1|text2' node scripts/test/ki-aufrufe-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-ki-aufrufe/`.
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG_ADMIN || '';
const APP = process.env.ARASUL_APP || 'probe-ki';
const JOB = process.env.ARASUL_JOB || '';
const MENSCH = process.env.ARASUL_MENSCH || '';
const MODELL = process.env.ARASUL_MODELL || '';
/** Was nirgends auf der Seite stehen darf: Inhalt und Name der Datei. */
const VERBOTEN = (process.env.ARASUL_VERBOTEN || '').split('|').filter(Boolean);

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-ki-aufrufe`);

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push(ok);
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!SITZUNG || !fs.existsSync(SITZUNG) || !JOB) {
  console.log('ROT    Sitzung oder Auftrag fehlt -- der Aufrufer setzt beides.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

const steht = (seite, waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG,
  viewport: { width: 1440, height: 900 },
});
try {
  const seite = await ctx.newPage();
  await seite.goto(`${URL}/workspace/settings?tab=apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const zeile = await steht(seite, `[data-testid="app-oeffnen-${APP}"]`, 30000);
  pruefe(`Die App-Verwaltung nennt ${APP}`, zeile);
  if (zeile) {
    await seite.locator(`[data-testid="app-oeffnen-${APP}"]`).click();
    const liste = await steht(seite, '[data-testid="ki-aufrufe-liste"]', 30000);
    pruefe('Ihre Ansicht zeigt den Abschnitt KI-Aufrufe', liste);
    if (liste) {
      const eintrag = seite
        .locator('li[data-testid^="ki-aufruf-"]')
        .filter({ hasText: JOB })
        .first();
      const da = await eintrag
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      const text = da ? (await eintrag.innerText()).replace(/\s+/g, ' ') : '';
      pruefe('Der Aufruf steht dort, mit seinem Auftrag', da, JOB);
      pruefe(
        'als document/extract-structured',
        text.includes('document/extract-structured'),
        text.slice(0, 120)
      );
      pruefe('mit dem Menschen', Boolean(MENSCH) && text.includes(`für ${MENSCH}`), MENSCH);
      pruefe('mit dem Modell', Boolean(MODELL) && text.includes(MODELL), MODELL);
      pruefe('mit der Dauer', /\d+(,\d)? s|\d+ ms/.test(text));
      const seitentext = await seite.locator('body').innerText();
      const gefunden = VERBOTEN.filter(v => seitentext.includes(v));
      pruefe('und ohne Inhalt oder Namen der Datei', gefunden.length === 0, gefunden.join(', '));

      await eintrag.scrollIntoViewIfNeeded().catch(() => {});
      await seite
        .locator('[data-testid="ki-aufrufe-liste"]')
        .screenshot({ path: path.join(ZIEL, 'ki-aufrufe-liste.png') })
        .catch(() => {});
      await seite.screenshot({ path: path.join(ZIEL, 'ki-aufrufe-seite.png') });
    }
  }
} finally {
  await ctx.close();
  await browser.close();
}

console.log(`Bilder: ${path.relative(WURZEL, ZIEL)}`);
process.exit(ergebnisse.every(Boolean) ? 0 : 1);
