/**
 * Misst, was eine Content-Security-Policy auf dem Geraet brechen wuerde.
 *
 * Hintergrund (Fund vom 22.08.2026). Die Seite, die der Browser als DOKUMENT
 * laedt, kam ohne jede Policy. Jeder API-Pfad hatte eine, ausgerechnet das
 * Dokument nicht. Zwei unabhaengige Gruende: der Traefik-Router
 * `dashboard-frontend` trug keine Sicherheitskopfzeilen, und das nginx im
 * Container verwirft seine eigene Policy, weil `location = /index.html` einen
 * eigenen `add_header`-Satz setzt und nginx den geerbten damit ERSETZT.
 *
 * Scharfschalten ohne Messung waere fahrlaessig: die Anwendung ist noch nie
 * unter einer Policy gelaufen. Sie hat zwei Inline-Skripte im `index.html`,
 * einen Worker im PDF-Betrachter und drei Stellen mit `new Function(`. Deshalb
 * gilt die Policy zuerst BERICHTEND, und dieses Skript laeuft die Anwendung ab
 * und sammelt ein, was sie melden wuerde.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/csp-abnahme.mjs
 *
 * Gruen heisst: die Policy kann scharf geschaltet werden. Rot heisst: entweder
 * die Policy anpassen oder die Stelle im Code aendern, die sie verletzt. Beides
 * ist eine Entscheidung, keine Formalie, deshalb steht am Ende die Liste und
 * nicht nur eine Zahl.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

/**
 * Den Einrichtungsassistenten wegnehmen, bevor gemessen wird.
 *
 * Sein Vorhang (`fixed inset-0 z-50 ... bg-black/50`) faengt jeden Klick ab.
 * Am 22.08.2026 sah das aus wie "der PDF-Betrachter zeichnet nichts" und war
 * ein Dialog. Dieselbe Falle wie in `chat-abnahme.mjs`, dort steht sie schon.
 */
async function assistentUeberspringen(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* nicht lesbar, dann eben mit Vorhang */
    }
  });
}

/**
 * Ein minimales, gueltiges PDF, das diese Messung selbst mitbringt.
 *
 * Vorher hing die Pruefung daran, dass zufaellig ein PDF im Dateibaum lag. Am
 * 23.08.2026 lag keins mehr da, und die Reihe wurde rot, ohne dass am Geraet
 * etwas kaputt war. Eine Abnahme, die von fremden Daten abhaengt, misst nicht
 * das Geraet, sondern den Zufall.
 *
 * Handgeschrieben statt aus einer Bibliothek: pdf.js braucht eine korrekte
 * xref-Tabelle, und die Offsets muessen zum Text passen, deshalb werden sie
 * beim Zusammenbauen gezaehlt und nicht eingetragen.
 */
function baueProbePdf() {
  const objekte = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Length 52 >>\nstream\nBT /F1 16 Tf 30 80 Td (Arasul Pruefseite) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objekte) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objekte.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}

const PDF_NAME = 'csp-probe.pdf';

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen ' : 'ROT   '} ${was}${detail ? `  (${detail})` : ''}`);
}

const pdfOrdner = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-csp-'));
const pdfLokal = path.join(pdfOrdner, PDF_NAME);
fs.writeFileSync(pdfLokal, baueProbePdf(), 'latin1');
let pdfHochgeladen = false;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  // Gespeicherte Sitzung wiederverwenden. Zehn Anmeldungen je Viertelstunde und
  // IP sind aufgebraucht, wenn mehrere Abnahmen hintereinander laufen
  // (23.08.2026).
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const page = await ctx.newPage();

// Die Projekt-Id steht in der Upload-Adresse. Mitlesen ist genauer, als sie
// nachher zu erraten, und ohne sie bleibt die Probe liegen.
let projektId = null;
page.on('request', r => {
  const t = r.url().match(/\/api\/projects\/([^/]+)\/dateien\/upload/);
  if (t) {
    projektId = t[1];
  }
});

// Ein Verstoss meldet sich auf zwei Wegen. Beide werden mitgeschrieben, weil
// `securitypolicyviolation` die Einzelheiten hat und die Konsole auch das
// erwischt, was vor dem ersten Skript passiert.
const verstoesse = [];
page.on('console', m => {
  const t = m.text();
  if (/Content Security Policy|Content-Security-Policy/i.test(t)) {
    verstoesse.push({ quelle: 'konsole', text: t.slice(0, 300) });
  }
});
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', e => {
    // `blockedURI` ist bei eval nur das Wort "eval". Ohne `sourceFile` steht
    // am Ende "irgendwo im Buendel", und genau das kostet die Stunde.
    (window.__cspVerstoesse ||= []).push({
      richtlinie: e.effectiveDirective || e.violatedDirective,
      quelle: (e.blockedURI || '').slice(0, 200),
      datei: (e.sourceFile || '').split('/').pop() || '',
      zeile: e.lineNumber,
      spalte: e.columnNumber,
    });
  });
});

/**
 * Bekannt und geprueft harmlos: eine Bibliothek im Hauptbuendel fragt mit
 * `new Function("")`, ob sie kompilieren darf, und faengt den Fehler ab
 * (`try{const a=Function;return new a(""),!0}catch{return!1}`). Unter einer
 * scharfen Policy antwortet die Frage schlicht mit Nein. Am 22.08.2026 auf
 * dem Orin nachgemessen, einschliesslich PDF-Betrachter: das war der EINZIGE
 * Verstoss im ganzen Durchlauf, und der Betrachter zeichnete drei Leinwaende.
 *
 * pdf.js bekommt vom Frontend ohnehin `isEvalSupported: false` mitgegeben.
 *
 * Bewusst eng gefasst: nur `script-src` mit `blockedURI = eval`. Jeder andere
 * Verstoss zaehlt.
 */
function istBekannteEvalProbe(v) {
  if (v.quelle === 'konsole') {
    return /unsafe-eval/.test(v.text || '');
  }
  return v.richtlinie === 'script-src' && v.quelle === 'eval';
}

async function eingesammelt() {
  const ausSeite = await page.evaluate(() => window.__cspVerstoesse || []).catch(() => []);
  const alle = [...verstoesse, ...ausSeite.map(v => ({ quelle: 'seite', ...v }))];
  return alle.filter(v => !istBekannteEvalProbe(v));
}

/** Alles, auch das Bekannte. Fuer die Schlussliste. */
async function eingesammeltRoh() {
  const ausSeite = await page.evaluate(() => window.__cspVerstoesse || []).catch(() => []);
  return [...verstoesse, ...ausSeite.map(v => ({ quelle: 'seite', ...v }))];
}

try {
  // --- 1. Kommt die Kopfzeile ueberhaupt an? --------------------------------
  const antwort = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const kopf = antwort.headers();
  const bericht = kopf['content-security-policy-report-only'];
  const scharf = kopf['content-security-policy'];
  // Beide Formen sind erlaubt, die Frage ist eine andere: TRAEGT das Dokument
  // ueberhaupt eine Policy. Bis zum 22.08.2026 trug es keine, und genau das
  // soll nie wieder unbemerkt passieren.
  pruefe(
    'Das Dokument traegt eine Policy',
    !!(scharf || bericht),
    scharf ? `scharf, ${scharf.length} Zeichen` : bericht ? `berichtend, ${bericht.length} Zeichen` : 'keine'
  );
  const evalErlaubt = /unsafe-eval/.test(scharf || bericht || '');
  pruefe(
    'Die Policy erlaubt kein unsafe-eval',
    !evalErlaubt,
    evalErlaubt ? 'unsafe-eval steht drin' : 'nicht enthalten'
  );
  for (const [name, erwartet] of [
    ['strict-transport-security', /max-age=\d+/],
    ['referrer-policy', /strict-origin/],
    ['permissions-policy', /camera=/],
    ['x-content-type-options', /nosniff/],
  ]) {
    pruefe(`Kopfzeile ${name}`, erwartet.test(kopf[name] || ''), kopf[name] || 'fehlt');
  }

  // --- 2. Anmelden ----------------------------------------------------------
  const an = await anmeldenFallsNoetig(page, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  if (!an.angemeldet) {
    pruefe('Anmeldung', false, an.grund);
  }
  await assistentUeberspringen(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  pruefe('Anmeldung', !page.url().includes('login'), page.url().replace(URL, '') || '/');

  // --- 3. Durch die Anwendung laufen ---------------------------------------
  // Jede Ecke, die eigene Wege zum Laden hat: Bilder, Blobs, Worker, Schrift.
  // Es gibt KEINE eigenen Seiten fuer Dokumente oder System: `/documents`,
  // `/data` und `/` leiten alle in den Arbeitsbereich. Am 22.08.2026
  // nachgesehen, statt aus einer Doku abgeschrieben. Vier Stationen, die
  // wirklich verschieden sind:
  const stationen = [
    ['Arbeitsplatz', '/workspace'],
    ['Einstellungen', '/workspace/settings'],
    ['Erweiterungen', '/workspace/store'],
    ['Terminal', '/workspace/terminal'],
  ];
  for (const [name, pfad] of stationen) {
    await page
      .goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch(() => {});
    await page.waitForTimeout(3500);
    const bisher = (await eingesammelt()).length;
    pruefe(`${name} ohne Verstoss`, bisher === 0, bisher ? `${bisher} bis hier` : 'sauber');
  }

  const vorPdf = (await eingesammelt()).length;

  // --- 3b. Der Weg, der am ehesten bricht: ein PDF im Betrachter -----------
  //
  // pdf.js laedt einen Worker (oft ueber eine blob:-URL) und probiert
  // `new Function("")`, um zu sehen, ob es seine PostScript-Funktionen
  // kompilieren darf. Beides beruehrt die Policy an Stellen, die keine andere
  // Seite beruehrt. Wer die Policy scharf schaltet, ohne das gemessen zu
  // haben, liefert ein Geraet aus, auf dem der Betrachter schweigt.
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  // Der Dateibaum des Arbeitsbereichs, nicht eine Dokumentenliste: `/documents`
  // leitet dorthin. Die Probe bringt ihr PDF selbst mit, siehe `baueProbePdf`.
  const eingabe = page.locator('[data-testid="explorer-upload-input"]');
  await eingabe.waitFor({ state: 'attached', timeout: 20000 });
  await eingabe.setInputFiles(pdfLokal);
  pdfHochgeladen = true;

  let imBaum = false;
  for (let i = 0; i < 30; i++) {
    imBaum = (await page.getByText(PDF_NAME, { exact: false }).count()) > 0;
    if (imBaum) break;
    await page.waitForTimeout(1000);
  }
  pruefe('Die Probe steht im Dateibaum', imBaum, PDF_NAME);

  const pdfZeile = page.getByText(PDF_NAME, { exact: false }).first();
  await pdfZeile.click().catch(() => {});
  let leinwand = 0;
  for (let i = 0; i < 20; i++) {
    leinwand = await page.locator('canvas').count();
    if (leinwand > 0) break;
    await page.waitForTimeout(1000);
  }
  pruefe('Ein PDF wird gezeichnet', leinwand > 0, `${PDF_NAME}, ${leinwand} Leinwand`);
  const nachPdf = (await eingesammelt()).length;
  pruefe('Der PDF-Betrachter bringt keinen neuen Verstoss', nachPdf === vorPdf, `${vorPdf} auf ${nachPdf}`);

  // --- 4. Das Urteil --------------------------------------------------------
  const alle = await eingesammelt();
  const roh = await eingesammeltRoh();
  pruefe(
    'Kein unerwarteter Verstoss im ganzen Durchlauf',
    alle.length === 0,
    `${alle.length} unerwartet, ${roh.length - alle.length} bekannte eval-Probe`
  );
  if (alle.length) {
    console.log('\nWas gemeldet wurde:');
    const gesehen = new Set();
    for (const v of alle) {
      const schluessel = `${v.richtlinie || ''}|${v.quelle}|${v.datei || ''}|${v.text || ''}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      const ort = v.datei ? `${v.datei}:${v.zeile}:${v.spalte}` : '';
      console.log(`  ${v.richtlinie || 'unbekannt'}  ${v.quelle}  ${ort}  ${v.text || ''}`);
    }
  }
} catch (fehler) {
  pruefe('Durchlauf ohne Ausnahme', false, String(fehler.message || fehler).slice(0, 300));
} finally {
  // Die Probe wieder wegnehmen. Sonst sammelt jeder Lauf eine an, und der
  // Dateibaum des Geraets fuellt sich mit Messresten.
  if (pdfHochgeladen && projektId) {
    const weg = await page
      .evaluate(
        async ([id, name]) => {
          const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
          const r = await fetch(`/api/projects/${id}/dateien?pfad=${encodeURIComponent(name)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'X-CSRF-Token': csrf },
          });
          return `HTTP ${r.status}`;
        },
        [projektId, PDF_NAME]
      )
      .catch(e => `Fehler: ${String(e.message).slice(0, 80)}`);
    console.log(`\nabgeraeumt: ${PDF_NAME} (${weg})`);
  } else if (pdfHochgeladen) {
    console.log(`\nHinweis: ${PDF_NAME} blieb liegen, die Projekt-Id war nicht zu sehen.`);
  }
  fs.rmSync(pdfOrdner, { recursive: true, force: true });
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length ? 1 : 0);
