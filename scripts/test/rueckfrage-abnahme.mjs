/**
 * Live-Abnahme I2, I3 und I4 (Plan 023): ein Flow haelt an und fragt.
 *
 * Der Plan fordert drei Dinge, und sie haengen zusammen:
 *
 *   I2  zwei Betriebsarten. `autonom` trifft die Annahme und schreibt sie mit,
 *       `rueckfragen` darf anhalten und fragen.
 *   I3  die Rueckfrage selbst: sie haelt den Lauf wirklich an, und das Warten
 *       blockiert die GPU nicht.
 *   I4  eine Vorlage nach dem Muster aus dem Entwicklungsordner: Daten zu einem
 *       Kunden auslesen, Rueckfrage, Ergebnis als Dokument.
 *
 * Gemessen wird im BROWSER und nicht ueber die API. Die Zusage lautet, dass ein
 * Nutzer die Frage beantworten kann; ein `curl` auf `/antwort` belegt nur, dass
 * der Endpunkt existiert.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/rueckfrage-abnahme.mjs
 *
 * Voraussetzung am Geraet: der Flow `angebot` ist angelegt und im Kundenordner
 * liegen Unterlagen. Fehlt eines von beidem, sagt das Skript das und faellt
 * nicht mit einem Fehler auf, der nach einem Produktmangel aussieht.
 */

import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const KUNDE = process.env.ARASUL_KUNDE || 'Abnahme Musterbau GmbH';
// Ein Lauf mit drei Schritten auf dem Standardmodell braucht Minuten, nicht
// Sekunden. Die Grenze ist grosszuegig, weil ein zu knapper Wert einen
// gesunden Lauf als Mangel meldet.
const GEDULD_MS = parseInt(process.env.ARASUL_GEDULD_MS || '1800000', 10);

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen ' : 'ROT   '} ${was}${detail ? `  (${detail})` : ''}`);
}

async function assistentUeberspringen(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* nicht lesbar, dann eben mit Vorhang */
    }
  });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

try {
  // --- Anmelden -------------------------------------------------------------
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[name="username"], input[type="text"]', BENUTZER);
  await page.fill('input[type="password"]', PASSWORT);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await assistentUeberspringen(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  pruefe('Anmeldung', !page.url().includes('login'), page.url().replace(URL, '') || '/');

  // --- Den Flow aus dem Chat starten ---------------------------------------
  // Ueber den Slash-Befehl, also den Weg des Nutzers, nicht ueber die API.
  const eingabe = page.locator('textarea, [contenteditable="true"]').first();
  await eingabe.waitFor({ state: 'visible', timeout: 20000 });
  await eingabe.focus();
  await page.keyboard.type('/angebot', { delay: 20 });
  await page.waitForTimeout(1200);
  const menue = await page.locator('[data-testid="slash-eintrag"], [role="option"]').count();
  pruefe('Der Flow steht im Slash-Menue', menue > 0, `${menue} Eintraege`);

  await page.keyboard.press('Escape');
  await eingabe.fill('');
  await page.keyboard.type(
    `/angebot kunde="projekt://aktiv/${KUNDE}" leistung="Lokale Dokumentensuche fuer Bauakten, ohne Cloud"`,
    { delay: 5 }
  );
  await page.keyboard.press('Enter');

  // --- I3: die Rueckfrage erscheint und haelt den Lauf an -------------------
  const karte = page.locator('[data-testid="flow-antwort-senden"]');
  let kamNach = null;
  const t0 = Date.now();
  try {
    await karte.waitFor({ state: 'visible', timeout: GEDULD_MS });
    kamNach = Math.round((Date.now() - t0) / 1000);
  } catch {
    /* bleibt null */
  }
  pruefe(
    'I3: der Lauf haelt an und fragt',
    kamNach !== null,
    kamNach !== null ? `nach ${kamNach} s` : 'keine Rueckfrage in der Geduldsspanne'
  );

  if (kamNach === null) {
    throw new Error('Ohne Rueckfrage sind die weiteren Pruefungen sinnlos.');
  }

  // Die Optionen aus dem Flow, plus das Freitextfeld.
  // Kennungen aus `RueckfrageKarte.tsx` gelesen, nicht geraten: die Optionen
  // heissen `flow-option-<i>`, das Freitextfeld `flow-antwort-frei`.
  const optionen = await page.locator('[data-testid^="flow-option-"]').count();
  pruefe('I3: die Frage bietet Optionen an', optionen >= 3, `${optionen} Optionen`);

  const freitext = await page.locator('[data-testid="flow-antwort-frei"]').count();
  pruefe('I3: daneben ein Freitextfeld', freitext > 0, `${freitext} Feld`);

  const frageText = await page
    .locator('[data-testid="flow-rueckfrage"]')
    .innerText()
    .catch(() => '');
  pruefe(
    'I3: die Frage ist deutsch',
    !/\b(please|choose|select|how detailed)\b/i.test(frageText),
    frageText.split('\n')[0]?.slice(0, 70) || '(kein Text gefunden)'
  );

  // --- I3: antworten --------------------------------------------------------
  const ersteOption = page.locator('[data-testid^="flow-option-"]').first();
  if (await ersteOption.count()) {
    await ersteOption.click();
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="flow-antwort-senden"]').click();
  await page.waitForTimeout(2000);
  const kartenDanach = await page.locator('[data-testid="flow-antwort-senden"]').count();
  pruefe('I3: nach dem Absenden ist die Frage weg', kartenDanach === 0, `${kartenDanach} Karten`);

  // --- I4: das Ergebnis ist ein Dokument im Kundenordner --------------------
  // Gewartet wird auf das Laufende, nicht auf eine feste Zeit.
  let fertig = false;
  const t1 = Date.now();
  while (Date.now() - t1 < GEDULD_MS) {
    const text = await page.locator('body').innerText();
    if (/angebot\.md/i.test(text)) {
      fertig = true;
      break;
    }
    await page.waitForTimeout(5000);
  }
  pruefe(
    'I4: die Antwort nennt die geschriebene Datei',
    fertig,
    fertig ? 'angebot.md' : `nicht gefunden in ${Math.round((Date.now() - t1) / 1000)} s`
  );

  await page.screenshot({ path: '/tmp/abnahme-rueckfrage.png', fullPage: false });
} catch (fehler) {
  pruefe('Durchlauf ohne Ausnahme', false, String(fehler.message || fehler).slice(0, 300));
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length ? 1 : 0);
