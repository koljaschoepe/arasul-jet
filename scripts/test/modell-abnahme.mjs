/**
 * Der Modellwechsel im Chat, am Geraet gemessen.
 *
 * Entscheidung E2 aus Plan 023 lautet: „Qwen3.8 27B bleibt Standardmodell,
 * umschaltbar in den Einstellungen." Das „umschaltbar" war eine Zusage ohne
 * Beleg.
 *
 * Zu pruefen, ob sich ein Menue oeffnen laesst, waere zu wenig: ein Klick, der
 * nichts bewirkt, sieht genauso aus. Deshalb misst diese Abnahme die
 * WIRKUNG. Dieselbe Frage geht zweimal raus, einmal an das Standardmodell und
 * einmal an ein kleines. Antwortet das kleine nicht deutlich schneller, hat
 * der Wechsel nicht stattgefunden — und das laesst sich nicht vortaeuschen.
 *
 * Der Schwellwert ist bewusst KEINE feste Zahl: ein anderes Geraet rechnet
 * anders. Verglichen wird das Verhaeltnis der beiden Messungen zueinander.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/modell-abnahme.mjs
 */

import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
// Ein kleines Modell, das auf dem Orin liegt. Das Menue zeigt ANZEIGENAMEN
// („Gemma 3 1B"), nicht die Modell-Ids („gemma3:1b") — daran ist mein erster
// Anlauf gescheitert (23.08.2026). Ueber die Umgebung austauschbar, falls ein
// Geraet ein anderes kleines Modell vorhaelt.
const KLEIN = process.env.ARASUL_KLEINMODELL || 'Gemma 3 1B';
const FRAGE = 'Antworte mit genau einem Satz: Was ist ein Wartungsvertrag?';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

async function wartetAufFertigenLauf(seite, mindestens, zeitlimitMs = 1800000) {
  await seite
    .waitForFunction(
      min => {
        const antworten = document.querySelectorAll('[data-testid="assistant-message"]');
        if (antworten.length < min) return false;
        return !!antworten[antworten.length - 1].querySelector('[data-testid="tokens-pro-sekunde"]');
      },
      mindestens,
      { timeout: zeitlimitMs, polling: 2000 }
    )
    .catch(() => {});
}

/**
 * Die Tokenrate der letzten Antwort, wie sie unter ihr steht.
 *
 * Der Chip traegt BEIDES, Dauer und Rate („2:22 min · 9 tok/s"). Die erste
 * Zahl zu nehmen war falsch: sie ist die Dauer (23.08.2026, mein Fehler).
 * Gesucht ist ausdruecklich die Zahl vor „tok/s".
 */
async function tokenrate(seite) {
  const text = await seite
    .locator('[data-testid="assistant-message"]')
    .last()
    .locator('[data-testid="tokens-pro-sekunde"]')
    .innerText()
    .catch(() => '');
  const zahl = String(text).match(/([\d.,]+)\s*tok\/s/);
  return {
    rate: zahl ? parseFloat(zahl[1].replace(',', '.')) : null,
    roh: String(text).replace(/\s+/g, ' ').trim(),
  };
}

/** Eine Frage stellen und die Tokenrate der Antwort zurueckgeben. */
async function frageStellen(seite, frage) {
  const feld = seite.locator('textarea[aria-label="Nachricht an die KI"]');
  const vorher = await seite.locator('[data-testid="assistant-message"]').count();
  await feld.click();
  await feld.fill(frage);
  await seite.keyboard.press('Enter');
  const t0 = Date.now();
  await wartetAufFertigenLauf(seite, vorher + 1);
  const gemessen = await tokenrate(seite);
  return { ...gemessen, sekunden: Math.round((Date.now() - t0) / 1000) };
}

/** Ein Modell im Auswahlmenue setzen. `''` heisst „Auto (Standard)". */
async function modellWaehlen(seite, name) {
  await seite.locator('[aria-label="Modell wählen"]').click();
  const eintrag = name
    ? seite.getByRole('menuitem').filter({ hasText: name }).first()
    : seite.getByRole('menuitem').filter({ hasText: 'Auto (Standard)' }).first();
  await eintrag.waitFor({ state: 'visible', timeout: 10000 });
  await eintrag.click();
  await seite.waitForTimeout(1000);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  pruefe('Anmeldung', an.angemeldet, an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund);
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(5000);

  const knopf = seite.locator('[aria-label="Modell wählen"]');
  await knopf.waitFor({ state: 'visible', timeout: 20000 });
  const standardName = (await knopf.innerText()).trim();
  pruefe('das Auswahlmenue ist da', true, `steht auf „${standardName}"`);

  // Welche Modelle stehen zur Wahl?
  await knopf.click();
  const eintraege = await seite.getByRole('menuitem').allInnerTexts();
  await seite.keyboard.press('Escape');
  pruefe('es gibt mehr als ein Modell zur Wahl', eintraege.length > 1, `${eintraege.length} Eintraege`);
  const kleinDa = eintraege.some(t => t.includes(KLEIN));
  pruefe(`„${KLEIN}" steht zur Wahl`, kleinDa, kleinDa ? '' : eintraege.slice(0, 8).join(' | '));
  if (!kleinDa) {
    throw new Error('abbruch');
  }

  // --- 1. Standardmodell ----------------------------------------------------
  const gross = await frageStellen(seite, FRAGE);
  pruefe('das Standardmodell antwortet', gross.rate !== null, `${gross.roh} (Wanduhr ${gross.sekunden} s)`);

  // --- 2. Umschalten --------------------------------------------------------
  await modellWaehlen(seite, KLEIN);
  const jetzt = (await knopf.innerText()).trim();
  pruefe('die Anzeige nennt das gewaehlte Modell', jetzt.includes(KLEIN), `„${jetzt}"`);

  const klein = await frageStellen(seite, FRAGE);
  pruefe('das kleine Modell antwortet', klein.rate !== null, `${klein.roh} (Wanduhr ${klein.sekunden} s)`);

  // --- 3. Die Wirkung -------------------------------------------------------
  // Ein Klick, der nichts bewirkt, sieht aus wie einer, der wirkt. Das
  // Verhaeltnis der Tokenraten laesst sich nicht vortaeuschen.
  const faktor = gross.rate && klein.rate ? klein.rate / gross.rate : 0;
  // Argumentreihenfolge ist `(was, ok, detail)`. Sie zu vertauschen ergab eine
  // Pruefung, die nie rot werden konnte — genau die Klasse Fehler, die diese
  // Abnahmen sonst finden (23.08.2026, mein Fehler).
  pruefe(
    'das kleine Modell antwortet deutlich schneller, der Wechsel wirkt also',
    faktor > 2,
    `${klein.rate} gegen ${gross.rate} tok/s, Faktor ${faktor.toFixed(1)}`
  );
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  // Zurueck auf Auto. Sonst haengt der naechsten Messung ein kleines Modell an,
  // und sie misst etwas anderes, als sie glaubt.
  try {
    await modellWaehlen(seite, '');
    console.log('\nzurueckgesetzt auf Auto (Standard)');
  } catch {
    console.log('\nHinweis: konnte nicht auf Auto zuruecksetzen.');
  }
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
