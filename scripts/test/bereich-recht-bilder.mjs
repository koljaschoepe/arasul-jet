/**
 * Acht Ordner im Baum der Verwaltung und das Wegwerfen in einem Schritt, im
 * Browser (Auftrag bereich-anlegen-gibt-dem-admin-recht, 28.09.2026, J34;
 * auf die Verwaltung Firmenordner umgestellt am 05.10.2026, M5).
 *
 * Die Rechtematrix gibt es seit der Verwaltung Firmenordner nicht mehr, die
 * Stufen stehen je Ordner (`verwaltung-firmenordner-bilder.mjs`). Hier bleibt,
 * was die Matrix nicht war: acht Ordner halten, und das Wegwerfen.
 *
 * Aufgerufen von `bereich-recht-abnahme.sh`, das die acht Probe-Bereiche
 * vorher anlegt und danach wegraeumt. Gemessen wird:
 *
 *   1. Bei 390 und 1440 px: jeder der acht Probe-Bereiche steht im Baum; kein
 *      Name ist abgeschnitten (`scrollWidth` gegen `clientWidth`); seitlich
 *      rollt nichts. `.sr-only` zaehlt nicht.
 *   2. Bei 1440 px, Wegwerfen: die Rueckfrage nennt den Administrator mit
 *      „schreiben", die Kennung wird abgetippt, ein DELETE mit
 *      `rechte=entziehen` kommt mit 200 zurueck, die Zeile ist aus dem Baum
 *      verschwunden.
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
const PRAEFIX = process.env.ARASUL_PRAEFIX || '';
const ICH = process.env.ARASUL_ICH || '';
const WEGWERFEN = process.env.ARASUL_WEGWERFEN || '';
const ZIEL = process.env.ARASUL_BILDER || '/tmp';
const SEITE = `${URL}/workspace/verwaltung/firmenordner`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push(ok);
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!PRAEFIX || !ICH || !WEGWERFEN || !SITZUNG || !fs.existsSync(SITZUNG)) {
  console.log('ROT    Praefix, Name, Wegwerf-Kennung oder Sitzung fehlt.');
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

/** Was abgeschnitten ist und was seitlich rollt. */
function vermessen() {
  const abgeschnitten = [];
  for (const el of document.querySelectorAll(
    '[data-testid="ordner-baum"] [data-testid^="ordner-"]'
  )) {
    if (el.scrollWidth > el.clientWidth + 1) {
      abgeschnitten.push(
        `${el.textContent.trim().slice(0, 40)} ${el.scrollWidth}/${el.clientWidth}`
      );
    }
  }
  const roller = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    roller.push(`Dokument ${doc.scrollWidth}/${doc.clientWidth}`);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (String(el.className).includes('sr-only')) continue;
    const x = getComputedStyle(el).overflowX;
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      roller.push(
        `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? String(el.className).slice(0, 40)}] ${el.scrollWidth}/${el.clientWidth}`
      );
    }
  }
  return { abgeschnitten, roller };
}

const browser = await chromium.launch({ headless: true });
try {
  for (const breite of [390, 1440]) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: SITZUNG,
      viewport: { width: breite, height: 900 },
    });
    const seite = await ctx.newPage();
    await seite.goto(SEITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const da = await seite
      .locator('[data-testid="ordner-baum"]')
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`${breite} px: der Ordnerbaum steht`, da);
    if (!da) {
      await fotografieren(seite, `fehlt-${breite}.png`);
      await ctx.close();
      continue;
    }
    await seite.waitForTimeout(1500);

    const zeilen = await seite
      .locator(`[data-testid^="ordner-${PRAEFIX}-"]`)
      .evaluateAll(l => l.map(e => e.getAttribute('data-testid')));
    pruefe(
      `${breite} px: alle acht Probe-Bereiche stehen im Baum`,
      zeilen.length >= 8,
      `${zeilen.length}`
    );

    const { abgeschnitten, roller } = await seite.evaluate(vermessen);
    pruefe(
      `${breite} px: kein Name abgeschnitten`,
      abgeschnitten.length === 0,
      abgeschnitten.slice(0, 3).join('; ')
    );
    pruefe(
      `${breite} px: seitlich rollt nichts`,
      roller.length === 0,
      roller.slice(0, 3).join('; ')
    );
    await fotografieren(seite, `seite-${breite}.png`);
    await fotografieren(seite, `ordnerbaum-${breite}.png`, {
      element: seite.getByTestId('ordner-baum'),
    });

    if (breite === 1440) {
      // 3. Wegwerfen in einem Schritt.
      await seite.getByTestId(`ordner-wegwerfen-${WEGWERFEN}`).click();
      const liste = seite.getByTestId('ordner-wegwerfen-rechte');
      const nennt = await liste
        .waitFor({ timeout: 10000 })
        .then(() => liste.innerText())
        .catch(() => '');
      pruefe(
        `die Rueckfrage nennt ${ICH} mit „schreiben"`,
        nennt.includes(ICH) && nennt.includes('schreiben'),
        nennt.replace(/\s+/g, ' ').slice(0, 80)
      );
      await seite.getByTestId('ordner-wegwerfen-kennung').fill(WEGWERFEN);
      // Der Dialog blendet ein; ein Bild davor zeigt ihn halb durchsichtig.
      await seite.waitForTimeout(800);
      await fotografieren(seite, 'wegwerfen-rueckfrage.png');
      const antwort = seite
        .waitForResponse(
          r => r.url().includes('/api/firmenordner/ordner/') && r.request().method() === 'DELETE',
          { timeout: 20 * 60 * 1000 }
        )
        .catch(() => null);
      await seite.getByTestId('ordner-wegwerfen-absenden').click();
      const r = await antwort;
      pruefe(
        'ein Schritt: DELETE mit rechte=entziehen kommt mit 200 zurueck',
        r !== null && r.status() === 200 && r.url().includes('rechte=entziehen'),
        r ? `${r.status()}` : 'keine Antwort'
      );
      const weg = await seite
        .getByTestId(`ordner-${WEGWERFEN}`)
        .waitFor({ state: 'detached', timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      pruefe('und die Zeile ist aus dem Baum verschwunden', weg);
      await fotografieren(seite, 'nach-dem-wegwerfen.png');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const rote = ergebnisse.filter(ok => !ok).length;
console.log(`--- Browser: ${ergebnisse.length - rote} gruen, ${rote} rot · ${ZIEL} ---`);
process.exit(rote === 0 ? 0 : 1);
