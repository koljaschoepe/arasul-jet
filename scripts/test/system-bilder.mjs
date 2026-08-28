/**
 * Modelle und System im Browser: eine Sicherung auslösen und die Kurzliste
 * lesen. Abnahme A6, Phase D5 des Umbaus vom 26.08.2026.
 *
 * WARUM DAS IM BROWSER PASSIERT UND NICHT PER curl. Dass die Wege dahinter
 * antworten, misst `betrieb-abnahme.sh` seit C9 und `modelle-abnahme.sh` seit
 * C8. Was D5 hinzufuegt, ist ausschliesslich die Frage, ob ein Administrator
 * sie FINDET und bedient: bis heute sicherte er mit `docker exec` und las die
 * Kurzliste mit `psql`.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Die Modelle: die Liste zeigt GENAU die Kurzliste (die Kennungen kommen
 *      vom Aufrufer aus `config/modelle/kurzliste.json`), und das
 *      Standardmodell traegt sein Abzeichen -- genau eines.
 *   2. Die Aktualisierungen: die Fassung steht da, und wenn dieses Geraet
 *      nicht ueber die Schnittstelle einspielen kann, sagt es das.
 *   3. Die Sicherung wird ausgeloest. Die Meldung erscheint, und die Liste
 *      zeigt danach eine Sicherung mit Datum und Groesse.
 *
 * NICHT MEHR HIER (Phase D6): die drei Breiten, zweimal. Sie standen in fuenf
 * Bilder-Skripten nebeneinander und stehen jetzt einmal, in
 * `scripts/test/oberflaeche-abnahme.mjs`.
 *
 * DIE SICHERUNG DAUERT MINUTEN, nicht Sekunden: `backup.sh` laeuft im
 * Sicherungs-Container ueber die ganze Datenbank, die App-Pakete und die
 * Flows. Die Geduld unten ist deshalb gross; sie misst nicht das Geraet, sie
 * gibt ihm Zeit.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt die Sitzung des Administrators als
 * `storageState` unter `$ARASUL_SITZUNG` ab (`arasul_sitzung_bauen`).
 *
 * Aufruf (der Regelfall ist ueber `system-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_MODELLE=id1,id2,... \
 *   ARASUL_STANDARD=<id> node scripts/test/system-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-system-d5/`.
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
/** Die Kennungen der Kurzliste, kommagetrennt. Der Aufrufer liest sie aus der Datei. */
const MODELLE = (process.env.ARASUL_MODELLE || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
/** Das Standardmodell des Geraets, aus GET /api/models/default. Darf leer sein. */
const STANDARD = process.env.ARASUL_STANDARD || '';

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-system-d5`);

const SICHERUNG = `${URL}/workspace/settings?tab=sicherung`;
const AKTUALISIERUNG = `${URL}/workspace/settings?tab=updates`;
const MODELLSEITE = `${URL}/workspace/modelle`;

/** So lange darf eine Sicherung am Jetson brauchen. */
const SICHERUNG_GEDULD = Number(process.env.ARASUL_SICHERUNG_GEDULD_MS || 20 * 60_000);

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!SITZUNG || !fs.existsSync(SITZUNG)) {
  console.log('ROT    Keine Sitzung unter ARASUL_SITZUNG -- der Aufrufer baut sie.');
  process.exit(1);
}
if (MODELLE.length === 0) {
  console.log('ROT    ARASUL_MODELLE fehlt -- der Aufrufer liest die Kurzliste.');
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

const steht = (waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

try {
  // HIER STANDEN ZWEI BREITENSCHLEIFEN (bis Phase D6, 28.08.2026), eine auf
  // der Sicherung und eine auf den Modellen -- dieselben drei Breiten mit
  // denselben vier Fragen wie in vier weiteren Bilder-Skripten aus D1 bis D4.
  // Das Breitenraster steht seit D6 einmal, in
  // `scripts/test/oberflaeche-abnahme.mjs`, und dort fuer alle Ansichten und
  // beide Rollen. Was hier bleibt, ist der HANDGRIFF: die Kurzliste gegen
  // `config/modelle/kurzliste.json` halten und eine Sicherung ausloesen.

  // --- 1. Genau die Kurzliste ------------------------------------------------
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(MODELLSEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const modelleDa = await steht('[data-testid="modell-liste"]', 30000);
  pruefe('Die Modell-Ansicht zeigt eine Liste', modelleDa);

  if (modelleDa) {
    await seite.waitForTimeout(1500);
    const gezeigt = await seite.$$eval('[data-testid="modell-liste"] > li', zeilen =>
      zeilen.map(z => z.getAttribute('data-testid').replace(/^modell-/, ''))
    );
    const fehlt = MODELLE.filter(id => !gezeigt.includes(id));
    const zuviel = gezeigt.filter(id => !MODELLE.includes(id));
    pruefe(
      'Die Ansicht zeigt GENAU die Kurzliste',
      fehlt.length === 0 && zuviel.length === 0,
      `${gezeigt.length} Zeilen${fehlt.length ? `, fehlt: ${fehlt.join(' ')}` : ''}${
        zuviel.length ? `, zuviel: ${zuviel.join(' ')}` : ''
      }`
    );

    if (STANDARD) {
      const abzeichen = await seite.locator(`[data-testid="standard-${STANDARD}"]`).count();
      pruefe('Das Standardmodell traegt sein Abzeichen', abzeichen === 1, STANDARD);
    } else {
      pruefe('Das Standardmodell traegt sein Abzeichen', false, 'kein Standard gesetzt');
    }

    // Die KI-RAM-Zeile steht im Kopf und kommt aus /models/memory-budget.
    const kopf = await seite.locator('[data-testid="modelle-seite"]').innerText();
    pruefe('Der Kopf nennt das KI-RAM', /KI-RAM/i.test(kopf));

  }

  // --- 2. Die Aktualisierungen ----------------------------------------------
  await seite.goto(AKTUALISIERUNG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const updateDa = await steht('[data-testid="update-seite"]', 30000);
  pruefe('Die Aktualisierungen stehen', updateDa);
  if (updateDa) {
    await seite.waitForTimeout(1500);
    const text = await seite.locator('[data-testid="update-seite"]').innerText();
    pruefe('Sie nennen die Fassung dieses Geraets', /Fassung/.test(text));
    // Ehrlichkeit: entweder steht der Weg zum Einspielen da, oder der Grund,
    // warum es hier nicht geht. Beides zugleich waere falsch, keines von
    // beiden auch.
    const grund = await seite.locator('[data-testid="einspielen-nicht-moeglich"]').count();
    const weg = await seite.getByText('.araupdate Datei auswählen').count();
    pruefe(
      'Entweder der Weg zum Einspielen oder der Grund, warum es nicht geht',
      (grund === 1) !== (weg === 1),
      grund === 1 ? 'Grund steht da' : 'Weg steht da'
    );
    await seite.screenshot({ path: path.join(ZIEL, '1440-aktualisierungen.png') });
  }

  // --- 3. Sichern ------------------------------------------------------------
  await seite.goto(SICHERUNG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await steht('[data-testid="sicherung-seite"]', 30000);
  await seite.waitForTimeout(1500);

  const knopf = seite.locator('[data-testid="sicherung-ausloesen"]');
  const bereit = await knopf.isEnabled().catch(() => false);
  pruefe('Der Knopf „Jetzt sichern" steht bereit', bereit);

  if (bereit) {
    await seite.screenshot({ path: path.join(ZIEL, 'sicherung-vorher.png') });
    await knopf.click();

    const meldung = seite.locator('[data-testid="sicherung-meldung"]');
    const kam = await meldung
      .waitFor({ timeout: SICHERUNG_GEDULD })
      .then(() => true)
      .catch(() => false);
    pruefe('Nach dem Klick erscheint eine Meldung', kam);

    if (kam) {
      const wort = (await meldung.innerText()).trim();
      pruefe('und sie sagt, dass die Sicherung fertig ist', /fertig/i.test(wort), wort.slice(0, 120));

      // Die Liste erneuert sich ueber die Entwertung der Abfrage, ohne
      // Neuladen. Ein `reload()` verstecke genau das.
      const listeDa = await steht('[data-testid="sicherungsliste"]', 60000);
      pruefe('Die Liste der Sicherungen steht danach da, ohne Neuladen', listeDa);

      if (listeDa) {
        const erste = await seite.locator('[data-testid="sicherungsliste"] > li').first().innerText();
        // Datum wie „28.08.2026, 12:30" und eine Groesse wie „5,2 GB".
        pruefe('Die oberste Sicherung nennt ihr Datum', /\d{2}\.\d{2}\.\d{4}/.test(erste), erste.split('\n')[0]);
        pruefe('und ihre Groesse', /\d+([.,]\d+)?\s?(B|KB|MB|GB)/.test(erste), erste.split('\n')[1] ?? '');
      }
      await seite.screenshot({ path: path.join(ZIEL, 'sicherung-nachher.png'), fullPage: true });
    }
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
