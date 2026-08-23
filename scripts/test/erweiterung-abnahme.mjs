/**
 * Misst die sichtbare Kette einer App-Erweiterung auf dem Geraet:
 * einschalten -> Knopf in der Seitenleiste -> Tab in der Mitte -> und darin
 * eine LAUFENDE KI-Bruecke.
 *
 * Der letzte Schritt ist der eigentliche Grund fuer dieses Skript (Fund vom
 * 23.08.2026). Der Tab oeffnete sich, die App zeichnete ihre Oberflaeche, und
 * der Browser meldete daneben:
 *
 *   net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin
 *   .../api/extensions/beispiel-app/app/arasul-bruecke.js
 *
 * Der Rahmen laeuft absichtlich ohne `allow-same-origin`, hat also einen
 * opaken Origin; Helmet setzt auf jede Antwort `Cross-Origin-Resource-Policy:
 * same-origin`. Die Bruecken-API war fuer diesen Rahmen gebaut — `brueckeCors`
 * laesst `Origin: null` ausdruecklich zu — nur ihre eigene Client-Datei kam nie
 * darin an. Da `arasul-bruecke.js` ein klassisches Skript ist, warf die
 * Inline-Zeile darunter `ReferenceError`, und die App blieb bei
 * „Bruecke: warte auf Token".
 *
 * Ein Blick auf den Tab haette gruen gesagt. Deshalb prueft dieses Skript den
 * Text, den nur eine ANTWORTENDE Bruecke erzeugt, und nicht, ob etwas erscheint.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/erweiterung-abnahme.mjs
 */

import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const APP = process.env.ARASUL_APP || 'Beispiel-App';

const befunde = [];
const merke = (ok, text) => {
  befunde.push({ ok, text });
  console.log(`${ok ? 'OK  ' : 'ROT '} ${text}`);
};

const browser = await chromium.launch({ headless: true });
const kontext = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
});
const seite = await kontext.newPage();

/** Alles, was der Browser NICHT geladen bekam — das ist hier die Messgroesse. */
const blockiert = [];
seite.on('requestfailed', r => {
  blockiert.push(`${r.failure()?.errorText || 'fehlgeschlagen'} ${r.url()}`);
});

let selbstEingeschaltet = false;

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[name="username"], input[type="text"]', BENUTZER);
  await seite.fill('input[type="password"]', PASSWORT);
  await seite.click('button[type="submit"]');
  await seite.waitForTimeout(4000);
  await seite.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* Speicher gesperrt — der Hinweis stoert nur die Sicht, nicht die Messung. */
    }
  });

  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(4000);

  // Einschalten, falls noetig. Der Schalter traegt „<Name> aktivieren", der
  // fertige Eintrag in der Seitenleiste nur den Namen.
  const knopf = seite.locator(`[aria-label="${APP}"]`).first();
  if ((await knopf.count()) === 0) {
    // Der Schalter steht im Erweiterungs-Raster; `/store` leitet in den
    // Arbeitsbereich um und oeffnet es dort.
    await seite.goto(`${URL}/store`, { waitUntil: 'domcontentloaded' });
    await seite.waitForTimeout(4000);
    const schalter = seite.locator(`[aria-label="${APP} aktivieren"]`).first();
    if ((await schalter.count()) === 0) {
      merke(false, `weder Knopf noch Schalter fuer „${APP}" gefunden`);
      throw new Error('abbruch');
    }
    await schalter.click();
    selbstEingeschaltet = true;
    await seite.waitForTimeout(5000);
  }
  merke((await seite.locator(`[aria-label="${APP}"]`).count()) > 0, `„${APP}" steht in der Seitenleiste`);

  blockiert.length = 0; // ab hier zaehlt nur, was der Tab selbst nachlaedt
  await seite.locator(`[aria-label="${APP}"]`).first().click();

  const rahmen = seite.locator('[data-testid="extension-frame"]');
  await rahmen.waitFor({ state: 'visible', timeout: 20000 });
  merke(true, 'der Tab oeffnet einen Rahmen');

  // Der Rahmen hat einen opaken Origin; Playwright kommt trotzdem hinein.
  const inhalt = seite.frameLocator('[data-testid="extension-frame"]');
  const status = inhalt.locator('#status');
  await status.waitFor({ state: 'visible', timeout: 20000 });

  let text = '';
  for (let i = 0; i < 30; i++) {
    text = (await status.textContent()) || '';
    if (/Br(ü|ue)cke aktiv/i.test(text)) break;
    await seite.waitForTimeout(1000);
  }
  merke(/Br(ü|ue)cke aktiv/i.test(text), `Bruecke im Rahmen: „${text.trim()}"`);

  const bruecke = blockiert.filter(z => z.includes('arasul-bruecke'));
  merke(bruecke.length === 0, bruecke.length ? `blockiert: ${bruecke[0]}` : 'nichts blockiert beim Laden der App');
  if (blockiert.length) {
    console.log('--- alle fehlgeschlagenen Anfragen ---');
    console.log(blockiert.slice(0, 8).join('\n'));
  }
} catch (e) {
  if (e.message !== 'abbruch') merke(false, `Abbruch: ${e.message}`);
} finally {
  // Den Stand zuruecklassen, wie er war. Ein eingeschaltet vergessenes Paket
  // haette die naechste Messung still verfaelscht.
  if (selbstEingeschaltet) {
    try {
      await seite.goto(`${URL}/store`, { waitUntil: 'domcontentloaded' });
      await seite.waitForTimeout(4000);
      const s = seite.locator(`[aria-label="${APP} deaktivieren"]`).first();
      if ((await s.count()) > 0) await s.click();
      await seite.waitForTimeout(2000);
    } catch {
      console.log('Hinweis: konnte die Erweiterung nicht wieder ausschalten.');
    }
  }
  await browser.close();
}

const rot = befunde.filter(b => !b.ok).length;
console.log(`\n${befunde.length - rot}/${befunde.length} gruen`);
process.exit(rot ? 1 : 0);
