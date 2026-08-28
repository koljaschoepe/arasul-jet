/**
 * Die Verwaltung im Browser: einen Menschen anlegen, ihm ein Startpasswort
 * setzen, ihm GENAU EINE App freigeben. Abnahme A4, Phase D3 des Umbaus vom
 * 26.08.2026.
 *
 * WARUM DAS IM BROWSER PASSIERT UND NICHT PER curl. Dass die Wege dahinter
 * funktionieren, misst `mitarbeiter-abnahme.sh` seit Phase C2. Was D3
 * hinzufuegt, ist ausschliesslich die Frage, ob ein ADMINISTRATOR sie findet
 * und bedient -- bis dahin legte er einen Mitarbeiter mit `curl` an. Eine
 * Freigabe per `curl` beantwortet diese Frage nicht.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Drei Breiten (390, 1024, 1440). Zu jeder: steht die Seite, rollt sie
 *      waagerecht, steht etwas da, meldet die Konsole einen Fehler. Die
 *      Konsolenfrage ist keine Formalie -- die Funde der D1- und D2-Abnahme
 *      waren beide Konsolenmeldungen (403 aus dem DownloadContext, 403 aus
 *      dem KI-RAM-Budget).
 *   2. Anlegen: der Dialog, das Formular, und danach steht die Zeile in der
 *      Liste -- OHNE Neuladen. Sie traegt "Startpasswort".
 *   3. Passwort setzen: der zweite Dialog. Danach traegt die Zeile weiterhin
 *      "Startpasswort", denn ein gesetztes Passwort IST eines (Migration 178).
 *   4. Freigeben: ein Haken in der Matrix. Danach steht in der Zelle der
 *      Stand-Schalter "Live" -- er erscheint nur, wenn die Freigabe wirklich
 *      steht, und ist damit die Probe darauf, dass die Liste sich nach dem
 *      Klick selbst erneuert hat.
 *
 * Was daraus geworden ist, misst `admin-abnahme.sh` danach am Backend: der
 * Mitarbeiter meldet sich mit dem hier gesetzten Passwort an und sieht genau
 * die hier freigegebene App.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt die Sitzung des Administrators als
 * `storageState` unter `$ARASUL_SITZUNG` ab (`arasul_sitzung_bauen`). Die
 * Drossel laesst zehn Anmeldungen je Viertelstunde und IP durch, und dieser
 * Lauf soll keine davon verbrauchen.
 *
 * Aufruf (der Regelfall ist ueber `admin-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG=... ARASUL_MITARBEITER=... ARASUL_MAIL=... \
 *   ARASUL_PASS_ERST=... ARASUL_PASS_START=... ARASUL_APP=beispielapp \
 *     node scripts/test/admin-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-admin-d3/`.
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
const MITARB = process.env.ARASUL_MITARBEITER || '';
const MAIL = process.env.ARASUL_MAIL || '';
/** Das Passwort beim Anlegen. Es wird gleich darauf ersetzt. */
const PASS_ERST = process.env.ARASUL_PASS_ERST || '';
/** Das Startpasswort, mit dem der Mitarbeiter danach hereinkommt. */
const PASS_START = process.env.ARASUL_PASS_START || '';
const APP = process.env.ARASUL_APP || 'beispielapp';

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-admin-d3`);

/** Der Weg zur Sektion. Der Suchteil geht in den Tab-Router hinein (B1). */
const SEITE = `${URL}/workspace/settings?tab=benutzer`;

/** Die drei Breiten aus dem Auftrag der Phase (wie in D1 und D2). */
const BREITEN = [
  { px: 390, hoehe: 844, name: 'telefon' },
  { px: 1024, hoehe: 768, name: 'tablet' },
  { px: 1440, hoehe: 900, name: 'arbeitsplatz' },
];

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

for (const [name, wert] of Object.entries({ MITARB, MAIL, PASS_ERST, PASS_START })) {
  if (!wert) {
    console.log(`ROT    ${name} fehlt -- der Aufrufer setzt es.`);
    process.exit(1);
  }
}
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

let konsole = [];
seite.on('console', m => {
  if (m.type() === 'error') konsole.push(m.text().slice(0, 200));
});

const steht = (waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

try {
  // --- 1. Die drei Breiten ---------------------------------------------------
  for (const breite of BREITEN) {
    await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
    konsole = [];
    await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const shell = await steht('[data-testid="workspace-shell"]', 30000);
    pruefe(`${breite.px} px: die Shell steht`, shell);

    const seiteDa = shell && (await steht('[data-testid="mitarbeiter-seite"]'));
    pruefe(`${breite.px} px: die Mitarbeiter-Seite steht`, seiteDa);

    if (seiteDa) {
      // Die Seite holt drei Listen (Benutzer, Apps, Freigaben); ohne diese
      // Pause zeigt das Bild ein Skelett.
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

    pruefe(
      `${breite.px} px: keine Fehler in der Konsole`,
      konsole.length === 0,
      konsole.slice(0, 2).join(' | ')
    );
  }

  // Ab hier der Arbeitsplatz: die Matrix braucht Breite.
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await steht('[data-testid="mitarbeiter-seite"]', 30000);
  await seite.waitForTimeout(1500);

  // --- 2. Anlegen ------------------------------------------------------------
  const oeffnen = await steht('[data-testid="mitarbeiter-anlegen-oeffnen"]');
  pruefe('Die Seite hat einen Knopf "Menschen anlegen"', oeffnen);

  let angelegt = false;
  if (oeffnen) {
    await seite.locator('[data-testid="mitarbeiter-anlegen-oeffnen"]').click();
    const formular = await steht('#neu-username');
    pruefe('Der Dialog zum Anlegen geht auf', formular);

    if (formular) {
      await seite.locator('#neu-username').fill(MITARB);
      await seite.locator('#neu-email').fill(MAIL);
      await seite.locator('#neu-passwort').fill(PASS_ERST);
      await seite.screenshot({ path: path.join(ZIEL, 'anlegen-formular.png') });
      await seite.locator('[data-testid="mitarbeiter-anlegen-absenden"]').click();

      // OHNE NEULADEN: die Zeile erscheint, weil die Abfrage nach der Mutation
      // entwertet und neu geholt wurde. Ein `reload()` verstecke genau das.
      angelegt = await steht(`[data-testid="mitarbeiter-${MITARB}"]`, 30000);
      pruefe('Der Mensch steht danach in der Liste, ohne Neuladen', angelegt);

      const start = await steht(`[data-testid="startpasswort-${MITARB}"]`);
      pruefe('und seine Zeile sagt "Startpasswort"', start);
    }
  }

  // --- 3. Das Startpasswort setzen -------------------------------------------
  let gesetzt = false;
  if (angelegt) {
    await seite.locator(`[data-testid="passwort-${MITARB}"]`).click();
    const dialog = await steht('#setz-passwort');
    pruefe('Der Dialog "Startpasswort setzen" geht auf', dialog);

    if (dialog) {
      await seite.locator('#setz-passwort').fill(PASS_START);
      await seite.locator('[data-testid="passwort-setzen-absenden"]').click();
      // Der Dialog schliesst sich erst, wenn der Server geantwortet hat.
      gesetzt = await seite
        .locator('#setz-passwort')
        .waitFor({ state: 'detached', timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      pruefe('Das Startpasswort ist gesetzt', gesetzt);

      // Ein gesetztes Passwort IST ein Startpasswort (Migration 178). Stuende
      // hier "eigenes", waere die Zeile 34 vom 27.08.2026 gerade gebrochen.
      const immerNoch = await steht(`[data-testid="startpasswort-${MITARB}"]`);
      pruefe('Die Zeile sagt weiterhin "Startpasswort"', immerNoch);
    }
  }

  // --- 4. Genau eine App freigeben -------------------------------------------
  if (gesetzt) {
    const zelle = `${APP}-${MITARB}`;
    const matrix = await steht(`[data-testid="freigabe-${zelle}"]`);
    pruefe(`Die Matrix hat eine Zelle fuer ${APP} mal ${MITARB}`, matrix);

    if (matrix) {
      await seite.screenshot({ path: path.join(ZIEL, 'matrix-vor-der-freigabe.png') });
      await seite.locator(`[data-testid="freigabe-${zelle}"] input`).check();

      // Der Stand-Schalter steht nur da, WENN die Freigabe steht. Er ist damit
      // die Probe darauf, dass der Klick angekommen und die Liste ohne
      // Neuladen erneuert ist.
      const steht_frei = await steht(`[data-testid="freigabe-stand-${zelle}"]`, 30000);
      pruefe('Nach dem Haken steht die Freigabe -- ohne Neuladen', steht_frei);

      if (steht_frei) {
        const wort = await seite
          .locator(`[data-testid="freigabe-stand-${zelle}"]`)
          .innerText()
          .catch(() => '');
        pruefe('und sie gilt fuer den Livestand', wort.trim() === 'Live', wort || 'nichts');
      }
      await seite.screenshot({ path: path.join(ZIEL, 'matrix-nach-der-freigabe.png') });
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
