/**
 * Die Spalte „Platz" und die Grenze im Dialog, im Browser (Auftrag
 * bereich-quote-sichtbar, 28.09.2026, J33).
 *
 * Aufgerufen von `bereich-quote-abnahme.sh`, das den Probe-Bereich vorher
 * anlegt, seine Grenze auf 50 MB setzt und ihn danach wegraeumt. Gemessen
 * wird:
 *
 *   1. Bei 390, 1024 und 1440 px: die Zelle Platz des Probe-Bereichs nennt
 *      die Grenze 50 MB, und seitlich rollt nichts, weder das Dokument noch
 *      ein Kasten. `.sr-only` zaehlt nicht. (Notizspalte und Rechtematrix
 *      gibt es seit M5 nicht mehr; die Seite steht unter
 *      `/workspace/verwaltung/firmenordner`.)
 *   2. Bei 390 px: der Dialog der Grenze, als Bild.
 *   3. Bei 1440 px: der Administrator hebt die Grenze im Dialog auf 200 MB;
 *      `PUT …/grenze` kommt mit 200 zurueck, und die Zelle nennt danach
 *      200 MB.
 *
 * DER BROWSER SIEHT NIE EIN PASSWORTFELD: die Sitzung kommt als Datei
 * (`arasul_sitzung_bauen`), die Anmeldeseite wird nicht besucht.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG || '';
const KENNUNG = process.env.ARASUL_KENNUNG || '';
const ZIEL = process.env.ARASUL_BILDER || '/tmp';
const SEITE = `${URL}/workspace/verwaltung/firmenordner`;
const MB = 1000 * 1000;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push(ok);
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!KENNUNG || !SITZUNG || !fs.existsSync(SITZUNG)) {
  console.log('ROT    Kennung oder Sitzung fehlt.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

/** Ein Bild -- aber nie, solange ein Passwortfeld etwas traegt. */
async function fotografieren(seite, datei, opts = {}) {
  const gefuellt = await seite.evaluate(() =>
    [...document.querySelectorAll('input[type="password"]')].some(e => e.value)
  );
  if (gefuellt) {
    pruefe(`Bild ${datei} verweigert: ein Passwortfeld ist gefuellt`, false);
    return;
  }
  await (opts.element ?? seite).screenshot({
    path: path.join(ZIEL, datei),
    ...(opts.element ? {} : { fullPage: true }),
  });
}

/** Was seitlich rollt. */
function roller() {
  const liste = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    liste.push(`Dokument ${doc.scrollWidth}/${doc.clientWidth}`);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (String(el.className).includes('sr-only')) continue;
    const x = getComputedStyle(el).overflowX;
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      liste.push(
        `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? String(el.className).slice(0, 40)}] ${el.scrollWidth}/${el.clientWidth}`
      );
    }
  }
  return liste;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const breite of [390, 1024, 1440]) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: SITZUNG,
      viewport: { width: breite, height: 900 },
    });
    const seite = await ctx.newPage();
    await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const zelle = seite.getByTestId(`ordner-platz-${KENNUNG}`);
    const da = await zelle
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`${breite} px: die Zelle Platz des Probe-Bereichs steht`, da);
    if (!da) {
      await fotografieren(seite, `fehlt-${breite}.png`);
      await ctx.close();
      continue;
    }
    // Die Zahlen kommen aus einer zweiten Anfrage; bis dahin steht ein Strich.
    await seite
      .waitForFunction(
        k => document.querySelector(`[data-testid="ordner-platz-${k}"]`)?.dataset.grenze,
        KENNUNG,
        { timeout: 15000 }
      )
      .catch(() => null);
    pruefe(
      `${breite} px: sie nennt die Grenze 50 MB`,
      (await zelle.getAttribute('data-grenze')) === String(50 * MB) &&
        (await zelle.innerText()).includes('50 MB'),
      (await zelle.innerText()).replace(/\s+/g, ' ')
    );

    await seite.waitForTimeout(1200);
    const form = await seite
      .locator('[data-form]')
      .filter({ has: seite.getByTestId('ordner-baum') })
      .first()
      .getAttribute('data-form')
      .catch(() => '?');
    const rollt = await seite.evaluate(roller);
    pruefe(
      `${breite} px: seitlich rollt nichts (Baum als ${form})`,
      rollt.length === 0,
      rollt.slice(0, 3).join('; ')
    );
    await fotografieren(seite, `seite-${breite}.png`);
    await fotografieren(seite, `ordnerbaum-${breite}.png`, {
      element: seite.getByTestId('ordner-baum'),
    });

    if (breite === 390) {
      await zelle.click();
      await seite.getByTestId('grenze-dialog').waitFor({ timeout: 10000 });
      await seite.waitForTimeout(800);
      pruefe(
        '390 px: der Dialog zeigt die gesetzte Grenze',
        (await seite.getByTestId('grenze-zahl').inputValue()) === '50'
      );
      await fotografieren(seite, 'grenze-dialog-390.png');
      await seite.keyboard.press('Escape');
    }

    if (breite === 1440) {
      await zelle.click();
      await seite.getByTestId('grenze-dialog').waitFor({ timeout: 10000 });
      await seite.getByTestId('grenze-zahl').fill('200');
      // Die Einheit steht schon auf MB (sie kommt aus der gesetzten Grenze).
      const einheit = await seite.getByTestId('grenze-einheit').innerText();
      if (!einheit.includes('MB')) {
        await seite.getByTestId('grenze-einheit').click();
        await seite.getByRole('option', { name: 'MB' }).click();
      }
      await seite.waitForTimeout(500);
      await fotografieren(seite, 'grenze-dialog-1440.png');
      const antwort = seite
        .waitForResponse(r => r.url().endsWith('/grenze') && r.request().method() === 'PUT', {
          timeout: 30000,
        })
        .catch(() => null);
      await seite.getByTestId('grenze-absenden').click();
      const r = await antwort;
      pruefe(
        '1440 px: der Administrator hebt die Grenze im Dialog auf 200 MB',
        r !== null && r.status() === 200,
        r ? String(r.status()) : 'keine Antwort'
      );
      const neu = await seite
        .waitForFunction(
          ([k, g]) =>
            document.querySelector(`[data-testid="ordner-platz-${k}"]`)?.dataset.grenze === g,
          [KENNUNG, String(200 * MB)],
          { timeout: 15000 }
        )
        .then(() => true)
        .catch(() => false);
      pruefe(
        'und die Zelle nennt danach 200 MB',
        neu,
        (await zelle.innerText()).replace(/\s+/g, ' ')
      );
      await seite.waitForTimeout(600);
      await fotografieren(seite, 'nach-dem-anheben-1440.png');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const rote = ergebnisse.filter(ok => !ok).length;
console.log(`--- Browser: ${ergebnisse.length - rote} gruen, ${rote} rot · ${ZIEL} ---`);
process.exit(rote === 0 ? 0 : 1);
