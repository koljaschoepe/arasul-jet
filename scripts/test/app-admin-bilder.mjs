/**
 * Die App-Ansicht im Browser: bestaetigen, lesen, umstellen. Abnahme A5,
 * Phase D4 des Umbaus vom 26.08.2026.
 *
 * ZWEI MENSCHEN, ZWEI SITZUNGEN, EIN LAUF. Das ist der Grund, warum beide
 * Teile in EINEM Skript stehen und nicht in zweien: der Lauf, den der
 * Administrator am Ende liest, ist genau der, den der Mitarbeiter vorher
 * bestaetigt hat. Zwei Skripte muessten ihn sich ueber die Befehlszeile
 * zureichen, und dazwischen laege eine Wartezeit, die niemandem gehoert.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Der MITARBEITER sieht die offene Freigabe auf seinem Dashboard (D2)
 *      und bestaetigt sie. Die Zeile geht weg, ohne Neuladen.
 *   2. Die App-Ansicht: beide Staende mit Version und Zustand des Containers.
 *   3. Der Lauf: Schritte, und der Gedankengang darunter.
 *   4. Das Modell des Flows: auf ein anderes aus der Kurzliste umstellen, in
 *      der Liste nachsehen, wieder auf das Paket zurueck.
 *
 * NICHT MEHR HIER (Phase D6): die drei Breiten und die Probe darauf, dass die
 * Mitte bei 1440 px mit offener Notizspalte ganz bleibt (der zweite Fund der
 * D3-Abnahme). Beides steht jetzt in `scripts/test/oberflaeche-abnahme.mjs`,
 * und dort fuer jede Verwaltungsansicht statt fuer diese eine.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt beide Sitzungen als `storageState`
 * ab (`arasul_sitzung_bauen`). Die Drossel laesst zehn Anmeldungen je
 * Viertelstunde und IP durch, und dieser Lauf soll keine davon verbrauchen.
 *
 * Aufruf (der Regelfall ist ueber `app-admin-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG_ADMIN=... ARASUL_SITZUNG_MITARBEITER=... \
 *   ARASUL_APP=beispielapp ARASUL_FLOW=freigabe ARASUL_LAUF=42 \
 *   ARASUL_FREIGABE=7 ARASUL_MODELL=gemma4:e4b \
 *     node scripts/test/app-admin-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-app-admin-d4/`.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG_ADMIN = process.env.ARASUL_SITZUNG_ADMIN || '';
const SITZUNG_MITARBEITER = process.env.ARASUL_SITZUNG_MITARBEITER || '';
const APP = process.env.ARASUL_APP || 'beispielapp';
const FLOW = process.env.ARASUL_FLOW || 'freigabe';
const LAUF = process.env.ARASUL_LAUF || '';
const FREIGABE = process.env.ARASUL_FREIGABE || '';
/** Das Modell, auf das umgestellt und von dem zurueckgenommen wird. */
const MODELL = process.env.ARASUL_MODELL || '';

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-app-admin-d4`);

/** Der Weg zur Sektion. Der Suchteil geht in den Tab-Router hinein (B1). */
const SEITE = `${URL}/workspace/settings?tab=apps`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

for (const [name, wert] of Object.entries({ LAUF, FREIGABE, MODELL })) {
  if (!wert) {
    console.log(`ROT    ${name} fehlt -- der Aufrufer setzt es.`);
    process.exit(1);
  }
}
for (const datei of [SITZUNG_ADMIN, SITZUNG_MITARBEITER]) {
  if (!datei || !fs.existsSync(datei)) {
    console.log('ROT    Eine Sitzung fehlt -- der Aufrufer baut beide.');
    process.exit(1);
  }
}

fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({ headless: true });

/** Wartet auf einen Waehler und sagt ja oder nein, statt zu werfen. */
const steht = (seite, waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

// ---------------------------------------------------------------------------
// 1. Der Mitarbeiter bestaetigt
// ---------------------------------------------------------------------------
const ctxM = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG_MITARBEITER,
  viewport: { width: 1440, height: 900 },
});
try {
  const seite = await ctxM.newPage();
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shell = await steht(seite, '[data-testid="workspace-shell"]', 30000);
  pruefe('Der Mitarbeiter kommt in seine Shell', shell);

  const knopf = `[data-testid="freigabe-${FREIGABE}-bestaetigen"]`;
  const knopfDa = shell && (await steht(seite, knopf, 30000));
  pruefe(`Die Freigabe ${FREIGABE} steht auf seinem Dashboard`, knopfDa);

  if (knopfDa) {
    await seite.screenshot({ path: path.join(ZIEL, 'mitarbeiter-freigabe-offen.png') });
    await seite.locator(knopf).click();
    // OHNE NEULADEN: die Zeile geht weg, weil die Abfrage entwertet und neu
    // geholt wurde (D2). Ein `reload()` verstecke genau das.
    const weg = await seite
      .locator(`[data-testid="freigabe-${FREIGABE}"]`)
      .waitFor({ state: 'detached', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe('Er bestaetigt, und die Zeile ist weg -- ohne Neuladen', weg);
  }
} finally {
  await ctxM.close();
}

// ---------------------------------------------------------------------------
// 2. Der Administrator liest und stellt um
// ---------------------------------------------------------------------------
const ctxA = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG_ADMIN,
  viewport: { width: 1440, height: 900 },
});
const seite = await ctxA.newPage();

try {
  // HIER STANDEN DIE DREI BREITEN UND DER FUND DER D3-ABNAHME (bis Phase D6,
  // 28.08.2026). Beides ist verallgemeinert nach
  // `scripts/test/oberflaeche-abnahme.mjs` gewandert: das Breitenraster fuer
  // alle Ansichten und beide Rollen, und die Frage „bleibt die Mitte bei
  // 1440 px mit offener Notizspalte ganz" fuer JEDE Verwaltungsansicht statt
  // fuer diese eine. Ein Fund, der an einer Seite gemessen wird, faellt an der
  // naechsten wieder auf.
  //
  // Was hier bleibt, ist der HANDGRIFF: bestaetigen, lesen, umstellen.
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  pruefe('Die App-Verwaltung steht', await steht(seite, '[data-testid="apps-seite"]', 30000));
  await seite.waitForTimeout(1500);

  // --- Die App-Ansicht -------------------------------------------------------
  const zeile = await steht(seite, `[data-testid="app-oeffnen-${APP}"]`);
  pruefe(`Die Liste nennt ${APP}`, zeile);

  if (zeile) {
    await seite.locator(`[data-testid="app-oeffnen-${APP}"]`).click();
    const ansicht = await steht(seite, `[data-testid="app-ansicht-${APP}"]`, 30000);
    pruefe('Ihre Ansicht geht auf', ansicht);

    if (ansicht) {
      await seite.waitForTimeout(1500);
      const stand = await seite
        .locator('[data-testid="stand-live"]')
        .innerText()
        .catch(() => '');
      pruefe('Der Livestand nennt seine Version', /\d+\.\d+\.\d+/.test(stand), stand.split('\n')[1]);
      // „laeuft" deckt beide gesunden Faelle ab: mit und ohne
      // Gesundheitspruefung im Manifest.
      pruefe('und den Zustand seines Containers', /läuft|steht|kein Backend/.test(stand));
      await seite.screenshot({ path: path.join(ZIEL, 'app-ansicht.png'), fullPage: true });
    }
  }

  // --- Der Lauf mit Schritten und Gedankengang -------------------------------
  const laufKnopf = `[data-testid="lauf-oeffnen-${LAUF}"]`;
  const laufDa = await steht(seite, laufKnopf, 30000);
  pruefe(`Der Lauf ${LAUF} steht in der Liste`, laufDa);

  if (laufDa) {
    await seite.locator(laufKnopf).click();
    const schritte = await steht(seite, '[data-testid="lauf-schritte"]', 30000);
    pruefe('Der Lauf zeigt seine Schritte', schritte);

    if (schritte) {
      const anzahl = await seite
        .locator('[data-testid="lauf-schritte"]')
        .getAttribute('data-schritte');
      pruefe('und es sind welche da', Number(anzahl) > 0, `${anzahl} Schritte`);

      // Der Gedankengang ist ein Schritt der Art `modell` (D4). Er entsteht
      // nur, wenn das Modell neben einem Werkzeug-Aufruf auch etwas gesagt hat
      // -- bei einer festen Schritt-Kette wie `freigabe` muss es das nicht.
      // Deshalb wird hier gemeldet, was da ist, und nichts erzwungen: eine
      // rote Zeile waere eine Aussage ueber das Modell, nicht ueber das Geraet.
      const gedanken = await seite.locator('[data-schritt-art="modell"]').count();
      console.log(
        gedanken > 0
          ? `gruen  Der Lauf zeigt einen Gedankengang  (${gedanken} Schritt(e) der Art modell)`
          : '  --   Kein Gedankengang in diesem Lauf  (feste Schritt-Kette, das Modell redet nur am Ende)'
      );
      if (gedanken > 0) {
        ergebnisse.push({ was: 'Gedankengang', ok: true });
      }

      await seite.screenshot({ path: path.join(ZIEL, 'lauf-mit-schritten.png'), fullPage: true });
    }

    await seite.locator('[data-testid="lauf-zurueck"]').click();
    await steht(seite, `[data-testid="app-ansicht-${APP}"]`, 20000);
  }

  // --- Das Modell umstellen und zurueck --------------------------------------
  // DIE MESSUNG DER PHASE. Beide Richtungen, denn der Rueckweg ist der, den
  // man selten geht und der deshalb kaputtgeht.
  const modellKnopf = `[data-testid="flow-modell-${FLOW}"]`;
  const flowDa = await steht(seite, modellKnopf, 20000);
  pruefe(`Der Flow ${FLOW} steht in der App-Ansicht`, flowDa);

  if (flowDa) {
    await seite.locator(modellKnopf).click();
    const dialog = await steht(seite, '[data-testid="modell-quelle-lokal"]');
    pruefe('Der Modell-Dialog geht auf', dialog);

    if (dialog) {
      await seite.locator('[data-testid="modell-quelle-lokal"]').click();
      await seite.locator('[data-testid="modell-lokal"]').selectOption(MODELL);
      await seite.screenshot({ path: path.join(ZIEL, 'modell-dialog.png') });
      await seite.locator('[data-testid="modell-absenden"]').click();

      // OHNE NEULADEN: die Zeile des Flows traegt danach das neue Modell, weil
      // die Abfrage entwertet und neu geholt wurde.
      const umgestellt = await seite
        .locator(`[data-testid="flow-${FLOW}"]`)
        .filter({ hasText: MODELL })
        .waitFor({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      pruefe(`Der Flow rechnet jetzt mit ${MODELL} -- ohne Neuladen`, umgestellt);
      await seite.screenshot({ path: path.join(ZIEL, 'modell-umgestellt.png'), fullPage: true });

      // Und zurueck.
      await seite.locator(modellKnopf).click();
      await steht(seite, '[data-testid="modell-quelle-paket"]');
      await seite.locator('[data-testid="modell-quelle-paket"]').click();
      await seite.locator('[data-testid="modell-absenden"]').click();

      const zurueck = await seite
        .locator(`[data-testid="flow-${FLOW}"]`)
        .filter({ hasText: MODELL })
        .waitFor({ state: 'detached', timeout: 30000 })
        .then(() => true)
        .catch(async () => {
          // `detached` greift nicht, wenn die Zeile bleibt und nur ihr Text
          // wechselt. Dann zaehlt der Text.
          const text = await seite
            .locator(`[data-testid="flow-${FLOW}"]`)
            .innerText()
            .catch(() => '');
          return !text.includes(MODELL);
        });
      pruefe('Die Ueberschreibung laesst sich zuruecknehmen', zurueck);
      await seite.screenshot({ path: path.join(ZIEL, 'modell-zurueck.png'), fullPage: true });
    }
  }
} finally {
  await ctxA.close();
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log('');
console.log(`${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
