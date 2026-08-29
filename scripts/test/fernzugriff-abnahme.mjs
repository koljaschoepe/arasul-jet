/**
 * Live-Abnahme J2 (Plan 023): der Fernzugriff bei jeder Breite.
 *
 * Geprueft wird, was sich nur im echten Browser pruefen laesst: bricht die
 * Seite bei einer Breite, laufen die Schritte ueber die volle Breite, und
 * aktualisiert sich der Zustand ohne Neuladen?
 */
import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
// Gespeicherte Sitzung wiederverwenden: dreissig Fehlschlaege je Viertelstunde und
// IP sind aufgebraucht, wenn mehrere Abnahmen hintereinander laufen (23.08.2026).
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1400, height: 900 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const page = await ctx.newPage();

try {
  await page.addInitScript(() => { try { localStorage.setItem('arasul-onboarding-seen-v1','1'); } catch { /* egal */ } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(page, ctx, { url: URL, benutzer: 'admin', passwort: '2309' });
  pruefe('Anmeldung', an.angemeldet, an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund);
  if (an.neu) {
    await page.waitForURL(/\/workspace/, { timeout: 60000 }).catch(() => {});
  }

  await page.goto(`${URL}/settings?tab=remote-access`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const kopf = page.locator('h1, h2').filter({ hasText: 'Fernzugriff' });
  pruefe('Seite ist da', (await kopf.count()) > 0);

  // Der Zustand aktualisiert sich von selbst: eine zweite Statusabfrage muss
  // ohne Neuladen kommen.
  let abfragen = 0;
  page.on('response', r => { if (r.url().includes('/api/tailscale/status')) abfragen += 1; });
  const vorher = abfragen;
  await page.waitForTimeout(35000);
  pruefe('Zustand aktualisiert sich ohne Neuladen', abfragen > vorher, `${abfragen} Abfragen in 35 s`);

  // Das Bild ZUERST, vor jedem Groessenwechsel.
  //
  // Am 22.08.2026 stand hier die Aufnahme am Ende, nach der Schleife. Das Bild
  // zeigte dann eine rechts abgeschnittene Seite, und ich hielt das fuer einen
  // Fehler der Anwendung. Es war der Nachhall des Wechsels auf 400 Pixel: die
  // Aufteilung schaltet dort auf zwei Spalten (F5) und braucht laenger als die
  // Wartezeit, bis sie wieder drei zeichnet. Ein Bild aus einem halben Umbau
  // ist kein Befund.
  await page.screenshot({ path: '/tmp/j2-fernzugriff.png' });
  console.log('  Bild: /tmp/j2-fernzugriff.png');

  // Keine Breite bricht.
  for (const breite of [400, 600, 900, 1200, 1600]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.waitForTimeout(900);
    const ueberlauf = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      sicht: document.documentElement.clientWidth,
    }));
    pruefe(
      `keine waagerechte Rolle bei ${breite} px`,
      ueberlauf.doc <= ueberlauf.sicht + 1,
      `${ueberlauf.doc} gegen ${ueberlauf.sicht}`
    );
  }

} catch (e) {
  pruefe('Durchlauf ohne Absturz', false, e.message.slice(0, 180));
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length ? 1 : 0);
