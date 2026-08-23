/**
 * Gate G3: „Oberflaeche einheitlich", ueber alle Ansichten und drei Breiten.
 *
 * Die Waechter in der CI pruefen die Bausteine und die Farbwerte im Quelltext.
 * Was sie nicht sehen: ob eine Ansicht bei einer bestimmten Breite bricht, ob
 * sie ueberhaupt etwas zeichnet, und ob dabei Fehler in der Konsole landen.
 * Von den sechs Ansichten der Seitenleiste waren bis zum 23.08.2026 nur zwei
 * je live gemessen (Dateien ueber die Chat-Abnahme, Terminal ueber F5).
 *
 * Drei Fragen je Ansicht und Breite:
 *
 *   1. Rollt die Seite waagerecht? Dann passt etwas nicht hinein.
 *   2. Steht ueberhaupt etwas da? Eine leere Flaeche ist kein Erfolg.
 *   3. Meldet die Konsole einen Fehler?
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/oberflaeche-abnahme.mjs
 */

import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

/** Die Ansichten der Seitenleiste, ueber ihre Beschriftung angesteuert. */
const ANSICHTEN = ['Dateien', 'Modelle', 'Erweiterungen', 'Flows', 'Automation', 'Einstellungen'];
const BREITEN = [1024, 1280, 1600];

/**
 * Bekannte, benannte Ausnahmen. Jede braucht einen Grund, sonst waere die
 * Abnahme nur noch eine Liste von Ausreden.
 *
 * n8n laedt einen `data:`-Baustein, um `import.meta.resolve` zu pruefen. Unsere
 * Richtlinie verbietet `data:` fuer Skripte, also meldet der Browser einen
 * Verstoss. Plan 023 H4 haelt das ausdruecklich fest: „Der CSP-Verstoss beim
 * Einbetten bleibt vorerst offen, er ist folgenlos." Der Editor laeuft.
 */
const BEKANNTE_MELDUNGEN = [
  {
    ansicht: 'Automation',
    muster: /import\.meta\.resolve|data:text\/javascript/i,
    grund: 'n8n prueft import.meta.resolve mit einem data:-Baustein (Plan 023 H4, bekannt)',
  },
];

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();

/** Konsolenfehler je Ansicht sammeln. Nur echte Fehler, keine Warnungen. */
let fehlerFenster = [];
seite.on('console', m => {
  if (m.type() === 'error') {
    fehlerFenster.push(m.text().slice(0, 160));
  }
});
seite.on('pageerror', e => fehlerFenster.push(`pageerror: ${String(e.message).slice(0, 160)}`));

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  pruefe('Anmeldung', an.angemeldet, an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund);
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(4000);

  for (const breite of BREITEN) {
    await seite.setViewportSize({ width: breite, height: 1000 });
    await seite.waitForTimeout(800);

    for (const name of ANSICHTEN) {
      const knopf = seite.locator(`[aria-label="${name}"]`).first();
      if ((await knopf.count()) === 0) {
        pruefe(`${breite} px, „${name}" ist erreichbar`, false, 'kein Knopf in der Leiste');
        continue;
      }
      fehlerFenster = [];
      await knopf.click();
      await seite.waitForTimeout(2500);

      const mass = await seite.evaluate(() => ({
        rollt: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        // Sichtbarer Text in der Mitte, ohne Leiste und Kopfzeile.
        text: (document.querySelector('main')?.innerText || document.body.innerText || '')
          .replace(/\s+/g, ' ')
          .trim().length,
      }));

      pruefe(
        `${breite} px, „${name}" rollt nicht waagerecht`,
        !mass.rollt,
        `${mass.scrollWidth} gegen ${mass.clientWidth}`
      );
      pruefe(`${breite} px, „${name}" zeichnet etwas`, mass.text > 40, `${mass.text} Zeichen`);
      const bekannt = BEKANNTE_MELDUNGEN.filter(b => b.ansicht === name);
      const unerwartet = fehlerFenster.filter(t => !bekannt.some(b => b.muster.test(t)));
      const erklaert = fehlerFenster.length - unerwartet.length;
      pruefe(
        `${breite} px, „${name}" ohne unerklaerte Konsolenfehler`,
        unerwartet.length === 0,
        unerwartet.length
          ? unerwartet.slice(0, 2).join(' | ')
          : erklaert
            ? `${erklaert} bekannte: ${bekannt[0].grund}`
            : 'keine'
      );
    }
  }
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  await seite.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
