/**
 * Die Shell in drei Breiten, Phase D1 des Umbaus vom 26.08.2026.
 *
 * Die Messregel der Phase verlangt neben der Liste der freigegebenen Apps
 * einen "Screenshot in drei Breiten". Das ist keine Verzierung: das
 * Dreispalten-Raster hat eine Grenze (`useSchmalesFenster`, 900 px), unterhalb
 * derer die Sidebar wegfaellt, und ob die Mitte-Ansicht darunter noch etwas
 * zeigt, sagt kein Unit-Test.
 *
 *   390 px   Telefon, unter der Grenze: keine Sidebar, die Aktivitaetsleiste
 *            bleibt (sie ist einen Klick entfernt)
 *  1024 px   knapp ueber der Grenze: drei Spalten, alle schmal
 *  1440 px   der Regelfall am Arbeitsplatz
 *
 * Zu jeder Breite werden drei Fragen gestellt, dieselben wie in der
 * Oberflaechen-Abnahme aus Plan 023: rollt die Seite waagerecht (dann passt
 * etwas nicht hinein), steht ueberhaupt etwas da, meldet die Konsole einen
 * Fehler. Ein Bild allein belegt nichts -- es belegt etwas, wenn jemand es
 * ansieht, und die drei Fragen belegen es auch ohne.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_BENUTZER=... ARASUL_PASSWORT=... node scripts/test/shell-bilder.mjs
 *
 * Ohne eigene Angaben nimmt er den Administrator. `shell-abnahme.sh` gibt ihm
 * den Zugang des frisch angelegten MITARBEITERS mit -- die Mitarbeiter-Sicht
 * ist die, die zuerst stimmen muss.
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-shell-d1/`.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

// Der Tag kommt von aussen, damit zwei Laeufe am selben Tag in denselben
// Ordner schreiben statt in zwei fast gleiche.
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-shell-d1`);

/** Die drei Breiten aus dem Auftrag der Phase. */
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

fs.mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({ headless: true });
let fehlerFenster = [];

try {
  for (const breite of BREITEN) {
    // Ein eigener Kontext je Breite: der Workspace-Store haengt am
    // localStorage, und eine im Telefon-Fenster eingeklappte Sidebar waere
    // sonst im naechsten Bild immer noch zu.
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: breite.px, height: breite.hoehe },
    });
    const seite = await ctx.newPage();
    fehlerFenster = [];
    seite.on('console', m => {
      if (m.type() === 'error') fehlerFenster.push(m.text().slice(0, 200));
    });

    await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Anmelden. Je Kontext einmal -- drei Anmeldungen, und das ist der Preis
    // dafuer, dass jede Breite mit einem frischen Zustand anfaengt. Wer sie
    // sparen will, spart sich den Zustand, nicht die Anmeldung.
    const feld = seite.locator('input[type="password"]');
    await feld.waitFor({ timeout: 15000 }).catch(() => {});
    if ((await feld.count()) > 0) {
      await seite.fill('input#username', BENUTZER);
      await feld.fill(PASSWORT);
      await seite.click('button[type="submit"]');
    }

    // Auf die Shell warten, nicht auf eine Zeitspanne: eine feste Wartezeit ist
    // auf dem Jetson entweder zu kurz (rot ohne Grund) oder zu lang (Minuten
    // fuer drei Bilder).
    const shell = seite.locator('[data-testid="workspace-shell"]');
    const angekommen = await shell
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`${breite.px} px: die Shell steht`, angekommen);

    if (angekommen) {
      // Die Mitte hat Zeit, ihre Liste zu holen; ohne das zeigt das Bild ein
      // Skelett statt der Apps.
      await seite.waitForTimeout(1500);

      const rollt = await seite.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      pruefe(`${breite.px} px: die Seite rollt nicht waagerecht`, !rollt);

      const text = await seite.evaluate(() => document.body.innerText.trim().length);
      pruefe(`${breite.px} px: es steht etwas da`, text > 20, `${text} Zeichen`);

      // Unter 900 px gibt es keine drei Spalten (`useSchmalesFenster`). Das ist
      // die Regel, nicht ein Mangel -- geprueft wird, dass sie greift.
      const sidebarSichtbar = await seite
        .locator('[data-panel]#sidebar')
        .evaluate(el => el.getAttribute('data-shell-hidden') === 'false')
        .catch(() => false);
      pruefe(
        `${breite.px} px: ${breite.px < 900 ? 'keine' : 'eine'} Sidebar, wie vorgesehen`,
        breite.px < 900 ? !sidebarSichtbar : sidebarSichtbar
      );
    }

    const datei = path.join(ZIEL, `${breite.px}-${breite.name}.png`);
    await seite.screenshot({ path: datei, fullPage: false });
    console.log(`  Bild: ${path.relative(WURZEL, datei)}`);

    pruefe(
      `${breite.px} px: keine Fehler in der Konsole`,
      fehlerFenster.length === 0,
      fehlerFenster.slice(0, 2).join(' | ')
    );

    await ctx.close();
  }
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log('');
console.log(`${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
