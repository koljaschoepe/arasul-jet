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
// »Dateien« ist mit B2 gefallen (kein Explorer mehr).
const ANSICHTEN = ['Modelle', 'Erweiterungen', 'Flows', 'Automation', 'Einstellungen'];
const BREITEN = [1024, 1280, 1600];

/**
 * Ansichten, die KEINEN Knopf in der Seitenleiste haben und deshalb bisher in
 * keiner Messung vorkamen. Sie werden ueber ihre Adresse angesteuert, so wie
 * ein Tab sie oeffnet (`tabToPath` in `stores/workspaceStore.ts`).
 *
 * Am 23.08.2026 nachgesehen: alle zeichnen etwas, auch die leeren tragen
 * einen Text statt einer weissen Flaeche. Gemessen wird bei EINER Breite,
 * nicht bei dreien: es geht um "gibt es diese Ansicht ueberhaupt und bricht
 * sie", nicht um das Raster, das die Hauptansichten schon abdecken.
 */
const PFAD_ANSICHTEN = [
  // Kundenuebersicht, Projekte und Projektuebersicht sind mit B2 gefallen.
  ['Flow-Editor', '/workspace/flow'],
  ['Modelle ueber die Adresse', '/workspace/modelle'],
  ['Automationen ueber die Adresse', '/workspace/automationen'],
];

// Der Automationen-Tab ist ein iframe. Sein Inhalt liegt in einem eigenen
// Dokument, der Wirt hat deshalb null Zeichen Text. Das ist kein leerer Tab,
// das ist die Bauweise.
const OHNE_EIGENEN_TEXT = new Set();

/**
 * Bekannte, benannte Ausnahmen. Jede braucht einen Grund, sonst waere die
 * Abnahme nur noch eine Liste von Ausreden. Gebunden wird an die QUELLE
 * (`m.location().url`), nicht an die Ansicht: eine Meldung, die asynchron
 * eintrifft, landet sonst im Fenster der naechsten Ansicht. Seit Phase B5
 * (26.08.2026) ist die Liste leer; der einzige Eintrag war der
 * CSP-Verstoss des eingebetteten n8n.
 */
const BEKANNTE_MELDUNGEN = [];

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
    fehlerFenster.push({ text: m.text().slice(0, 160), ort: m.location()?.url ?? '' });
  }
});
seite.on('pageerror', e =>
  fehlerFenster.push({ text: `pageerror: ${String(e.message).slice(0, 160)}`, ort: '' })
);

// Die Konsole sagt bei einer fehlgeschlagenen Anfrage nur "Failed to load
// resource: 503" und verschweigt, WELCHE. Damit ist ein rotes Feld nicht
// nachvollziehbar. Deshalb wird die Adresse hier mitgeschrieben und beim
// Melden angehaengt (23.08.2026: zwei rote Punkte, und beide nannten nur den
// Code).
let antworten = [];
seite.on('response', r => {
  if (r.status() >= 500) {
    antworten.push(`${r.status()} ${r.url().replace(URL, '')}`);
  }
});

/** Was in diesem Fenster serverseitig schieflief, als Text fuer die Meldung. */
function serverfehler() {
  return [...new Set(antworten)].slice(0, 3).join(' | ');
}

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, {
    url: URL,
    benutzer: BENUTZER,
    passwort: PASSWORT,
  });
  pruefe(
    'Anmeldung',
    an.angemeldet,
    an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund
  );
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
      antworten = [];
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
      const passt = (b, f) =>
        b.muster.test(f.text) && (b.quelle ? b.quelle.test(f.ort) : b.ansicht === name);
      const unerwartet = fehlerFenster.filter(f => !BEKANNTE_MELDUNGEN.some(b => passt(b, f)));
      const erklaert = fehlerFenster.length - unerwartet.length;
      const bekannt = BEKANNTE_MELDUNGEN.filter(b => fehlerFenster.some(f => passt(b, f)));
      pruefe(
        `${breite} px, „${name}" ohne unerklaerte Konsolenfehler`,
        unerwartet.length === 0,
        unerwartet.length
          ? `${unerwartet
              .slice(0, 2)
              .map(f => f.text)
              .join(' | ')}${serverfehler() ? `  [${serverfehler()}]` : ''}`
          : erklaert
            ? `${erklaert} bekannte: ${bekannt[0].grund}`
            : 'keine'
      );
    }
  }
  // --- Die Ansichten ohne Knopf in der Leiste -------------------------------
  await seite.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, pfad] of PFAD_ANSICHTEN) {
    fehlerFenster = [];
    antworten = [];
    await seite
      .goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch(() => {});
    await seite.waitForTimeout(4000);

    const mass = await seite.evaluate(() => ({
      rollt: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: (document.querySelector('main')?.innerText || document.body.innerText || '')
        .replace(/\s+/g, ' ')
        .trim().length,
    }));

    pruefe(
      `„${name}" rollt nicht waagerecht`,
      !mass.rollt,
      `${mass.scrollWidth} gegen ${mass.clientWidth}`
    );
    if (OHNE_EIGENEN_TEXT.has(name)) {
      pruefe(`„${name}" ist erreichbar`, true, 'iframe, Text liegt im eigenen Dokument');
    } else {
      pruefe(`„${name}" zeichnet etwas`, mass.text > 40, `${mass.text} Zeichen`);
    }
    // Hier zaehlt nur das Muster: diese Ansichten werden einzeln angesteuert,
    // eine Ansichts-Bindung gibt es nicht.
    const unerwartet = fehlerFenster.filter(
      f => !BEKANNTE_MELDUNGEN.some(b => b.muster.test(f.text))
    );
    pruefe(
      `„${name}" ohne unerklaerte Konsolenfehler`,
      unerwartet.length === 0,
      unerwartet.length
        ? `${unerwartet
            .slice(0, 2)
            .map(f => f.text)
            .join(' | ')}${serverfehler() ? `  [${serverfehler()}]` : ''}`
        : 'keine'
    );
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
