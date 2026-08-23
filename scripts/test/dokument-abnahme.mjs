/**
 * Die Kernzusage des Geraets, am Geraet gemessen: ein Dokument hochladen und
 * danach eine Frage dazu beantwortet bekommen, mit Quelle.
 *
 * Das ist der Satz, mit dem Arasul verkauft wird, und er war bis zum
 * 23.08.2026 nicht als dauerhafte Abnahme belegt. Belegt war er einmal von
 * Hand, an einem Dokument, das schon auf dem Geraet lag. Das ist etwas
 * anderes: eine Datei, die seit Wochen da ist, sagt nichts darueber, ob eine
 * NEUE ankommt und gefunden wird.
 *
 * Deshalb legt diese Abnahme ein frisches Dokument an, mit einer Zahl, die es
 * sonst nirgends gibt. Ein Modell, das raet, kann sie nicht treffen. Und sie
 * raeumt es hinterher wieder weg.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/dokument-abnahme.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { anmeldenFallsNoetig, sitzungsZustand, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

// Eine Zahl, die sonst nirgends steht. Wer sie in der Antwort hat, hat das
// Dokument gelesen; wer raet, trifft sie nicht.
const VERTRAG = 'WV-2026-8834';
const BETRAG = '41.780';
const FRIST = 'sieben Wochen';
const DATEI = `pruefvertrag-${VERTRAG.toLowerCase()}.md`;

const INHALT = `# Wartungsvertrag ${VERTRAG}

Auftraggeber: Steinbach Verfahrenstechnik GmbH, Rosenheim
Auftragnehmer: Arasul Pruefstelle

## Verguetung

Die Grundpauschale betraegt ${BETRAG} Euro netto pro Jahr. Zusatzstunden
werden mit 118 Euro netto abgerechnet.

## Laufzeit und Kuendigung

Der Vertrag laeuft vom 01.04.2026 bis zum 31.03.2030. Die Kuendigungsfrist
betraegt ${FRIST} zum Laufzeitende.
`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

/** Wartet, bis die letzte Antwort fertig ist (sie traegt dann ihre Tokenrate). */
async function wartetAufFertigenLauf(seite, mindestens, zeitlimitMs = 1800000) {
  await seite
    .waitForFunction(
      min => {
        const antworten = document.querySelectorAll('[data-testid="assistant-message"]');
        if (antworten.length < min) return false;
        const letzte = antworten[antworten.length - 1];
        return !!letzte.querySelector('[data-testid="tokens-pro-sekunde"]');
      },
      mindestens,
      { timeout: zeitlimitMs, polling: 2000 }
    )
    .catch(() => {});
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-dok-'));
const lokal = path.join(tmp, DATEI);
fs.writeFileSync(lokal, INHALT, 'utf8');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();
let hochgeladen = false;
// Die Projekt-Id steht in der Upload-Adresse. Sie hier mitzulesen ist genauer,
// als sie nachtraeglich zu erraten.
let projektId = null;
seite.on('request', (r) => {
  const t = r.url().match(/\/api\/projects\/([^/]+)\/dateien\/upload/);
  if (t) {
    projektId = t[1];
  }
});

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

  // --- 1. Hochladen ---------------------------------------------------------
  const eingabe = seite.locator('[data-testid="explorer-upload-input"]');
  await eingabe.waitFor({ state: 'attached', timeout: 20000 });
  await eingabe.setInputFiles(lokal);
  hochgeladen = true;

  // Der Baum aktualisiert sich nach dem Hochladen von selbst.
  let imBaum = false;
  for (let i = 0; i < 30; i++) {
    imBaum = (await seite.getByText(DATEI, { exact: false }).count()) > 0;
    if (imBaum) break;
    await seite.waitForTimeout(1000);
  }
  pruefe('das Dokument steht im Explorer', imBaum, DATEI);

  // --- 2. Fragen ------------------------------------------------------------
  const feld = seite.locator('textarea[aria-label="Nachricht an die KI"]');
  await feld.waitFor({ state: 'visible', timeout: 20000 });
  const vorher = await seite.locator('[data-testid="assistant-message"]').count();

  await feld.click();
  await feld.fill(
    `Wie hoch ist die Grundpauschale im Wartungsvertrag ${VERTRAG}, und wie ` +
      `lang ist die Kuendigungsfrist? Antworte knapp und nenne die Quelle.`
  );
  await seite.keyboard.press('Enter');

  const t0 = Date.now();
  await wartetAufFertigenLauf(seite, vorher + 1);
  const dauer = Math.round((Date.now() - t0) / 1000);

  const antwort = (await seite.locator('[data-testid="assistant-message"]').last().innerText()) || '';
  const kurz = antwort.replace(/\s+/g, ' ').slice(0, 200);

  pruefe('die Antwort nennt die Grundpauschale', antwort.includes(BETRAG), `${BETRAG} in „${kurz}"`);
  pruefe(
    'die Antwort nennt die Kuendigungsfrist',
    /sieben\s+Wochen|7\s+Wochen/i.test(antwort),
    FRIST
  );
  pruefe('die Antwort weist eine Quelle aus', /Quelle|pruefvertrag/i.test(antwort), 'Quelle genannt');
  pruefe('die Antwort kam in unter zehn Minuten', dauer < 600, `${dauer} s`);
} catch (err) {
  pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
} finally {
  // Das Dokument wieder wegnehmen. Sonst sammelt jede Messung eines an, und
  // die naechste sucht in einem Feld aus Pruefvertraegen.
  if (hochgeladen && projektId) {
    try {
      const weg = await seite.evaluate(
        async ([id, name]) => {
          const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
          const r = await fetch(
            `/api/projects/${id}/dateien?pfad=${encodeURIComponent(name)}`,
            { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } }
          );
          return `HTTP ${r.status}`;
        },
        [projektId, DATEI]
      );
      console.log(`\nabgeraeumt: ${DATEI} (${weg})`);
    } catch (err) {
      console.log(`\nHinweis: ${DATEI} blieb liegen: ${String(err.message).slice(0, 80)}`);
    }
  } else if (hochgeladen) {
    console.log(`\nHinweis: ${DATEI} blieb liegen, die Projekt-Id war nicht zu sehen.`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
}

const rot = ergebnisse.filter((e) => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
