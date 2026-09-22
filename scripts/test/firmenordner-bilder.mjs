/**
 * Der Firmenordner im Browser: die Verwaltung vergibt ein Recht, liest das
 * Protokoll, und ein Mitarbeiter sieht nur seine Ordner (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * ZWEI MENSCHEN, ZWEI SITZUNGEN, EIN LAUF -- wie in `app-admin-bilder.mjs`:
 * was der Administrator hier vergibt, misst `firmenordner-abnahme.sh` danach
 * an `GET /api/firmenordner/rechte` nach, und was der Mitarbeiter sieht, ist
 * genau die Frage, die diese Karte stellt.
 *
 * WAS GEMESSEN WIRD, in dieser Reihenfolge:
 *
 *   1. Die Sektion steht: der Baum nennt die Wurzel, den Bereich, das Projekt
 *      und den Ordner am Geraet mit Kennung, Name und Art.
 *   2. Ein Ordner am Geraet und die Wurzel haben KEINE Rechtespalte.
 *   3. Der Administrator stellt in der Matrix eine Stufe ein (WEIT bekommt
 *      auf dem Projekt `schreiben`). Ob daraus dieselbe Zeile wurde wie aus
 *      `POST /api/firmenordner/rechte`, sieht die Shell danach nach.
 *   4. Weniger als oben: `lesen` auf dem Projekt, waehrend WEIT auf dem
 *      Bereich `schreiben` hat. Das Backend sagt 409, und der Satz mit dem
 *      Ausweg steht ueber der Matrix.
 *   5. Die Uebersicht eines Ordners oeffnet sich und liest das Protokoll.
 *   6. Der MITARBEITER (ENG, nur das Projekt) oeffnet „Mein Firmenordner":
 *      das Projekt steht da, der Bereich nicht als eigene Zeile, der Ordner
 *      am Geraet nirgends -- auch nicht als Name im Text der Seite.
 *
 * KEINE EIGENE ANMELDUNG. Der Aufrufer legt beide Sitzungen als
 * `storageState` ab (`arasul_sitzung_bauen`).
 *
 * Aufruf (der Regelfall ist ueber `firmenordner-abnahme.sh`):
 *   ARASUL_URL=... ARASUL_SITZUNG_ADMIN=... ARASUL_SITZUNG_MITARBEITER=... \
 *   ARASUL_BEREICH=... ARASUL_PROJEKT=... ARASUL_GERAETORDNER=... \
 *   ARASUL_WEIT=... ARASUL_ENG=... node scripts/test/firmenordner-bilder.mjs
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-firmenordner-j33/`.
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
const BEREICH = process.env.ARASUL_BEREICH || '';
const PROJEKT = process.env.ARASUL_PROJEKT || '';
const GERAETORDNER = process.env.ARASUL_GERAETORDNER || '';
const WEIT = process.env.ARASUL_WEIT || '';
const ENG = process.env.ARASUL_ENG || '';

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-firmenordner-j33`);
const SEITE = `${URL}/workspace/settings?tab=firmenordner`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

for (const [name, wert] of Object.entries({ BEREICH, PROJEKT, GERAETORDNER, WEIT, ENG })) {
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

/**
 * Eine Stufe in einer Zelle der Matrix waehlen. Das Auswahlfeld ist Radix'
 * `Select`: ein Klick auf den Ausloeser oeffnet die Liste in einem Portal.
 *
 * ANFAHREN, DRUECKEN, LOSLASSEN -- und nicht `click()` auf den Eintrag, und
 * nicht die Tastatur. Beides ist am 22.09.2026 am Orin gemessen: der Klick
 * auf „schreiben" liess die Liste offen stehen (das Bild zeigt sie mit dem
 * alten Haken, am Geraet entstand keine Zeile), und Enter nach einer
 * Vorauswahl per Buchstabe aenderte nichts. Radix waehlt einen Eintrag beim
 * Loslassen der Maus, aber nur, wenn es die Maus vorher ueber ihm gesehen
 * hat (`onPointerMove` setzt die Art des Zeigers); Playwrights `click()`
 * faehrt zwar hin, ist aber schneller, als die Liste ihren Zeiger merkt.
 * `hover()` und danach `mouse.down()`/`mouse.up()` an derselben Stelle traf
 * dreimal von dreimal (POST 201).
 *
 * Gewartet wird auf die ANTWORT des Geraets, nicht auf das Bild: die Zelle
 * kann „schreiben" schon vorher sagen („wie oben: schreiben").
 */
async function stufeWaehlen(seite, zelle, stufe) {
  await seite.getByTestId(zelle).click();
  const liste = seite.getByRole('listbox');
  await liste.waitFor({ timeout: 10000 });
  const eintrag = seite.getByTestId(`${zelle}-${stufe}`);
  await eintrag.waitFor({ timeout: 10000 });
  const antwort = seite
    .waitForResponse(
      r => r.url().includes('/api/firmenordner/rechte') && r.request().method() !== 'GET',
      { timeout: 30000 }
    )
    .catch(() => null);
  await eintrag.hover();
  await seite.mouse.down();
  await seite.mouse.up();
  await liste.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  const r = await antwort;
  return r ? r.status() : 0;
}

// ---------------------------------------------------------------------------
// 1. bis 5.: der Administrator
// ---------------------------------------------------------------------------
const ctxA = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: SITZUNG_ADMIN,
  viewport: { width: 1440, height: 900 },
});
try {
  const seite = await ctxA.newPage();
  await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const da = await steht(seite, '[data-testid="firmenordner-seite"]', 30000);
  pruefe('Die Sektion Firmenordner steht', da);
  if (da) {
    const baum = await steht(seite, '[data-testid="ordner-baum"]', 30000);
    pruefe('und zeigt den Ordnerbaum', baum);
    if (baum) {
      for (const [kennung, art] of [
        [BEREICH, 'geteilt'],
        [PROJEKT, 'geteilt'],
        [GERAETORDNER, 'am Gerät'],
      ]) {
        const zeile = seite.getByTestId(`ordner-${kennung}`);
        const steht_zeile = (await zeile.count()) > 0;
        const artWort = steht_zeile
          ? await seite
              .getByTestId(`ordner-art-${kennung}`)
              .innerText()
              .catch(() => '')
          : '';
        pruefe(
          `${kennung} steht im Baum mit seiner Art`,
          steht_zeile && artWort.trim() === art,
          artWort || 'fehlt'
        );
      }
      const wurzelZeile = seite.locator('[data-testid^="ordner-art-"]', { hasText: 'Wurzel' });
      pruefe('und die Wurzel steht darin', (await wurzelZeile.count()) === 1);
      const projektZeile = await seite
        .getByTestId(`ordner-${PROJEKT}`)
        .innerText()
        .catch(() => '');
      pruefe(
        'das Projekt traegt den Weg ueber seinen Bereich',
        projektZeile.includes(`${BEREICH}/${PROJEKT}`),
        projektZeile.split('\n')[0]
      );
      await seite.screenshot({ path: path.join(ZIEL, 'ordnerbaum.png'), fullPage: true });
    }

    // 2. Keine Spalte fuer den Ordner am Geraet und die Wurzel.
    const matrix = await steht(seite, '[data-testid="rechte-matrix"]', 30000);
    pruefe('Die Rechte-Matrix steht', matrix);
    if (matrix) {
      pruefe(
        'ein Ordner am Geraet hat keine Rechtespalte',
        (await seite.getByTestId(`recht-${GERAETORDNER}-${WEIT}`).count()) === 0
      );
      pruefe(
        'die Wurzel auch nicht',
        (await seite.locator('[data-testid^="recht-firma-"]').count()) === 0 &&
          (await seite.locator('[data-testid^="recht-wurzel-"]').count()) === 0
      );
      pruefe(
        'das Projekt dagegen schon',
        (await seite.getByTestId(`recht-${PROJEKT}-${WEIT}`).count()) === 1
      );

      // 3. Eine Stufe einstellen: WEIT bekommt auf dem Projekt `schreiben`.
      const zelle = `recht-${PROJEKT}-${WEIT}`;
      const status = await stufeWaehlen(seite, zelle, 'schreiben');
      await seite.waitForTimeout(1000);
      const wort = (
        await seite
          .getByTestId(zelle)
          .innerText()
          .catch(() => '')
      ).trim();
      // Genau „schreiben", nicht „wie oben: schreiben": das eine ist eine
      // eigene Zeile, das andere die Vererbung.
      pruefe(
        `${WEIT} bekommt im Browser „schreiben" auf ${PROJEKT}`,
        status === 201 && wort === 'schreiben',
        `POST -> ${status}, Zelle sagt „${wort}"`
      );
      await seite.screenshot({
        path: path.join(ZIEL, 'matrix-nach-der-vergabe.png'),
        fullPage: true,
      });

      // 4. Weniger als oben: 409 mit Ausweg.
      const status409 = await stufeWaehlen(seite, zelle, 'lesen');
      const fehler = await steht(seite, '[data-testid="rechte-fehler"]', 30000);
      pruefe('das Geraet antwortet darauf mit 409', status409 === 409, `POST -> ${status409}`);
      const satz = fehler
        ? await seite
            .getByTestId('rechte-fehler')
            .innerText()
            .catch(() => '')
        : '';
      pruefe(
        'weniger als auf dem Bereich wird abgewiesen, und der Satz nennt den Ausweg',
        fehler && satz.includes('einzeln'),
        satz.slice(0, 120)
      );
      await seite.screenshot({ path: path.join(ZIEL, 'matrix-409.png'), fullPage: true });
    }

    // 5. Die Uebersicht eines Ordners.
    const knopf = seite.getByTestId(`ordner-aenderungen-${BEREICH}`);
    if ((await knopf.count()) === 1) {
      await knopf.click();
      const protokoll = await steht(seite, '[data-testid="ordner-aenderungen"]', 30000);
      pruefe('die Uebersicht eines Ordners oeffnet sich', protokoll);
      if (protokoll) {
        // Entweder Zeilen oder der Leerzustand -- aber kein Fehler.
        await seite.waitForTimeout(1500);
        const fehler = await seite.getByTestId('aenderungen-fehler').count();
        const zeilen = await seite.getByTestId('aenderung').count();
        pruefe('und liest das Protokoll des Dienstes', fehler === 0, `${zeilen} Zeilen`);
        await seite.screenshot({ path: path.join(ZIEL, 'aenderungen.png') });
        await seite.keyboard.press('Escape');
      }
    } else {
      pruefe('die Uebersicht eines Ordners oeffnet sich', false, 'kein Knopf');
    }
  }
} finally {
  await ctxA.close();
}

// ---------------------------------------------------------------------------
// 6. Der Mitarbeiter mit nur einem Projekt
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
  pruefe(`${ENG} kommt in seine Shell`, shell);
  if (shell) {
    await seite.getByTestId('workspace-benutzermenue').click();
    await seite.getByTestId('workspace-firmenordner').click();
    const dialog = await steht(seite, '[data-testid="mein-firmenordner"]', 30000);
    pruefe('„Mein Firmenordner" oeffnet sich', dialog);
    if (dialog) {
      const liste = await steht(seite, '[data-testid="mein-firmenordner-liste"]', 30000);
      pruefe('und zeigt seine Ordner', liste);
      const projekt = (await seite.getByTestId(`mein-ordner-${PROJEKT}`).count()) === 1;
      pruefe(`das Projekt ${PROJEKT} steht darin, mit Stufe`, projekt);
      pruefe(
        'der Bereich darueber NICHT als eigene Zeile',
        (await seite.getByTestId(`mein-ordner-${BEREICH}`).count()) === 0
      );
      const wurzel = await seite
        .locator('[data-testid^="mein-ordner-"]')
        .first()
        .innerText()
        .catch(() => '');
      pruefe('die Wurzel steht zuerst', wurzel.includes('Wurzel'), wurzel.split('\n')[0]);
      const text = await seite
        .locator('body')
        .innerText()
        .catch(() => '');
      pruefe(
        'der Ordner am Geraet kommt nirgends vor, auch nicht als Name',
        !text.includes(GERAETORDNER)
      );
      await seite.screenshot({ path: path.join(ZIEL, 'mein-firmenordner.png') });
    }
  }
} finally {
  await ctxM.close();
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log('');
console.log(`${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
