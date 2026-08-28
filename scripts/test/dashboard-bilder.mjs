/**
 * Der Klick auf dem Dashboard, der die Phase misst.
 * Phase D2 des Umbaus vom 26.08.2026, geschnitten in D6.
 *
 * Die Messregel der Phase: "Freigabe aus C7 im Dashboard bestaetigen, Notiz
 * ueberlebt Neuladen." Beides passiert IM BROWSER und nirgends sonst -- eine
 * Bestaetigung per `curl` belegt den Weg aus C7 (das tut `freigabe-abnahme.sh`
 * seit einem Tag), aber nicht, dass ein Mensch ihn findet und drueckt.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Die offene Freigabe steht auf dem Dashboard, mit Titel und Frist.
 *   2. Die Notiz: schreiben, NEU LADEN, wieder da. Das Neuladen ist der Kern
 *      der Messung -- ein Textfeld, das seinen Inhalt nur im Speicher haelt,
 *      sieht bis dahin genauso aus.
 *   3. Der Klick auf "Bestaetigen". Die Zeile verschwindet OHNE NEULADEN;
 *      dass der Lauf danach `fertig` wird, misst `dashboard-abnahme.sh` am
 *      Backend weiter.
 *
 * NICHT MEHR HIER (Phase D6): die drei Breiten. Sie standen in fuenf
 * Bilder-Skripten nebeneinander und stehen jetzt einmal, in
 * `scripts/test/oberflaeche-abnahme.mjs`.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt die Sitzung des Mitarbeiters als
 * `storageState` unter `$ARASUL_SITZUNG` ab (`arasul_sitzung_bauen`). Drei
 * Kontexte mit je einer Anmeldung -- wie in D1 -- kosteten drei der zehn
 * Versuche je Viertelstunde, und die Abnahme danach meldete etwas ueber den
 * Messaufbau.
 *
 * Aufruf (der Regelfall ist ueber `dashboard-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_FREIGABE=<id> \
 *     node scripts/test/dashboard-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-dashboard-d2/`.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG || '';
/** Die Nummer der Freigabe, die dieser Lauf entscheiden soll. */
const FREIGABE = process.env.ARASUL_FREIGABE || '';

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-dashboard-d2`);

/** Der Text, den die Notiz ueber das Neuladen tragen soll. */
const NOTIZ = `Abnahme D2 ${Date.now()}`;

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
// EIN Kontext fuer alles: die Sitzung ist geliehen, und jeder weitere Kontext
// waere eine weitere Anmeldung an der Drossel (siehe Kopf).
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG,
  viewport: { width: 1440, height: 900 },
});
const seite = await ctx.newPage();

/** Auf die Shell warten, nicht auf eine Zeitspanne. */
async function shellSteht(grenze = 30000) {
  return seite
    .locator('[data-testid="workspace-shell"]')
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);
}

try {
  // HIER STAND DIE BREITENSCHLEIFE (bis Phase D6, 28.08.2026). Drei Breiten,
  // vier Fragen, drei Bilder -- und dieselben drei Breiten mit denselben vier
  // Fragen standen in vier weiteren Bilder-Skripten aus D1 bis D5. Sechs
  // Stellen mit einer Wahrheit ueber das Breitenraster: das Raster steht seit
  // D6 in `scripts/test/oberflaeche-abnahme.mjs`, fuer alle Ansichten und
  // beide Rollen. Was hier bleibt, ist der HANDGRIFF, den nur diese Abnahme
  // misst -- die Notiz ueber ein Neuladen und der Klick, der einen
  // angehaltenen Lauf weiterlaufen laesst.
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  pruefe('Die Shell steht', await shellSteht());
  await seite.waitForTimeout(2000);

  // --- 1. Die offene Freigabe steht da ---------------------------------------
  const liste = seite.locator('[data-testid="offene-freigaben"]');
  const listeDa = await liste
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  pruefe('Die offene Freigabe steht auf dem Dashboard', listeDa);

  if (listeDa) {
    const frist = await seite
      .locator(`[data-testid="freigabe-${FREIGABE}-frist"]`)
      .innerText()
      .catch(() => '');
    pruefe('und sie nennt ihre Restzeit', /noch|Frist/.test(frist), frist || 'nichts');
  }

  // --- 2. Die Notiz ueberlebt das Neuladen -----------------------------------
  const feld = seite.locator('#notizen-feld');
  const feldDa = await feld
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!feldDa) {
    pruefe('Das Notizfeld steht in der rechten Spalte', false, 'kein #notizen-feld');
  } else {
    await feld.fill(NOTIZ);
    // Der Zettel speichert nach EINER Sekunde Ruhe (`Notizen.tsx`). Gewartet
    // wird auf die Meldung darunter und nicht auf eine Zeitspanne -- die
    // waere auf dem Jetson entweder zu kurz oder unnoetig lang.
    const gespeichert = await seite
      .locator('[data-testid="notizen-stand"]')
      .filter({ hasText: 'gespeichert' })
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    pruefe('Der Zettel meldet, dass er gespeichert hat', gespeichert);

    await seite.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await shellSteht();
    const danach = await seite
      .locator('#notizen-feld')
      .inputValue()
      .catch(() => '');
    // DAS IST DIE MESSUNG DER PHASE. Ein Textfeld, das seinen Inhalt nur im
    // Speicher haelt, sieht bis zu diesem Neuladen genauso aus.
    pruefe('Die Notiz ueberlebt das Neuladen', danach === NOTIZ, `"${danach.slice(0, 40)}"`);
  }

  // --- 3. Der Klick, der den Lauf weiterlaufen laesst -------------------------
  await seite.waitForTimeout(1500);
  const knopf = seite.locator(`[data-testid="freigabe-${FREIGABE}-bestaetigen"]`);
  const knopfDa = await knopf
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  pruefe(`Die Freigabe ${FREIGABE} hat einen Knopf "Bestaetigen"`, knopfDa);

  if (knopfDa) {
    await seite.screenshot({ path: path.join(ZIEL, 'freigabe-vor-dem-klick.png') });
    await knopf.click();

    // OHNE NEULADEN: die Zeile geht weg, weil die Abfrage entwertet und neu
    // geholt wurde. Ein `reload()` an dieser Stelle wuerde die Messung
    // verstecken, um die es geht.
    const weg = await seite
      .locator(`[data-testid="freigabe-${FREIGABE}"]`)
      .waitFor({ state: 'detached', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe('Nach dem Bestaetigen ist die Zeile weg -- ohne Neuladen', weg);

    await seite.screenshot({ path: path.join(ZIEL, 'freigabe-nach-dem-klick.png') });
  }
} finally {
  await ctx.close();
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log('');
console.log(`${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
