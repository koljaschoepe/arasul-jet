/**
 * Das Dashboard in drei Breiten, und der Klick, der die Phase misst.
 * Phase D2 des Umbaus vom 26.08.2026.
 *
 * Die Messregel der Phase: "Freigabe aus C7 im Dashboard bestaetigen, Notiz
 * ueberlebt Neuladen." Beides passiert IM BROWSER und nirgends sonst -- eine
 * Bestaetigung per `curl` belegt den Weg aus C7 (das tut `freigabe-abnahme.sh`
 * seit einem Tag), aber nicht, dass ein Mensch ihn findet und drueckt.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Drei Breiten (390, 1024, 1440). Zu jeder: steht die Shell, rollt die
 *      Seite waagerecht, steht etwas da, meldet die Konsole einen Fehler.
 *      Die Konsolenfrage ist hier keine Formalie: der erste Fund der
 *      D1-Abnahme war genau so eine Meldung (403 aus dem DownloadContext).
 *   2. Die offene Freigabe steht auf dem Dashboard, mit Titel und Frist.
 *   3. Die Notiz: schreiben, NEU LADEN, wieder da. Das Neuladen ist der Kern
 *      der Messung -- ein Textfeld, das seinen Inhalt nur im Speicher haelt,
 *      sieht bis dahin genauso aus.
 *   4. Der Klick auf "Bestaetigen". Die Zeile verschwindet OHNE NEULADEN;
 *      dass der Lauf danach `fertig` wird, misst `dashboard-abnahme.sh` am
 *      Backend weiter.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt die Sitzung des Mitarbeiters als
 * `storageState` unter `$ARASUL_SITZUNG` ab (`arasul_sitzung_bauen`). Drei
 * Kontexte mit je einer Anmeldung -- wie in D1 -- kosteten drei der zehn
 * Versuche je Viertelstunde, und die Abnahme danach meldete etwas ueber den
 * Messaufbau. Ein Kontext, drei Fenstergroessen.
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

/** Die drei Breiten aus dem Auftrag der Phase (wie in D1). */
const BREITEN = [
  { px: 390, hoehe: 844, name: 'telefon' },
  { px: 1024, hoehe: 768, name: 'tablet' },
  { px: 1440, hoehe: 900, name: 'arbeitsplatz' },
];

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
  viewport: { width: BREITEN[BREITEN.length - 1].px, height: 900 },
});
const seite = await ctx.newPage();

let konsole = [];
seite.on('console', m => {
  if (m.type() === 'error') konsole.push(m.text().slice(0, 200));
});

/** Auf die Shell warten, nicht auf eine Zeitspanne. */
async function shellSteht(grenze = 30000) {
  return seite
    .locator('[data-testid="workspace-shell"]')
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);
}

try {
  // --- 1. Die drei Breiten ---------------------------------------------------
  for (const breite of BREITEN) {
    await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
    konsole = [];
    await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const angekommen = await shellSteht();
    pruefe(`${breite.px} px: die Shell steht`, angekommen);

    if (angekommen) {
      // Die Mitte holt ihre Listen (Apps und Freigaben); ohne diese Pause
      // zeigt das Bild ein Skelett.
      await seite.waitForTimeout(2000);

      const rollt = await seite.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      pruefe(`${breite.px} px: die Seite rollt nicht waagerecht`, !rollt);

      const text = await seite.evaluate(() => document.body.innerText.trim().length);
      pruefe(`${breite.px} px: es steht etwas da`, text > 20, `${text} Zeichen`);
    }

    const datei = path.join(ZIEL, `${breite.px}-${breite.name}.png`);
    await seite.screenshot({ path: datei, fullPage: false });
    console.log(`  Bild: ${path.relative(WURZEL, datei)}`);

    // Der erste Fund der D1-Abnahme war eine Konsolenmeldung, kein Bild.
    pruefe(
      `${breite.px} px: keine Fehler in der Konsole`,
      konsole.length === 0,
      konsole.slice(0, 2).join(' | ')
    );
  }

  // Ab hier der Arbeitsplatz: die schmalen Breiten haben keine rechte Spalte.
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await shellSteht();
  await seite.waitForTimeout(2000);

  // --- 2. Die offene Freigabe steht da ---------------------------------------
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

  // --- 3. Die Notiz ueberlebt das Neuladen -----------------------------------
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

  // --- 4. Der Klick, der den Lauf weiterlaufen laesst -------------------------
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
