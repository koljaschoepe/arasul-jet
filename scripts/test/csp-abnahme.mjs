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

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen ' : 'ROT   '} ${was}${detail ? `  (${detail})` : ''}`);
}

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
  // leitet dorthin.
  const pdfZeile = page.getByText(/\.pdf$/i).first();
  if (await pdfZeile.count()) {
    const name = (await pdfZeile.innerText().catch(() => '')).trim();
    await pdfZeile.click().catch(() => {});
    await page.waitForTimeout(9000);
    const leinwand = await page.locator('canvas').count();
    pruefe('Ein PDF wird gezeichnet', leinwand > 0, `${name}, ${leinwand} Leinwand`);
  } else {
    // Kein Befund, sondern eine nicht gefahrene Pruefung. Der Unterschied
    // zaehlt: ein rotes Feld, das nur "mein Klick hat nicht getroffen" heisst,
    // ist schlimmer als gar keine Zeile.
    pruefe('Ein PDF zum Oeffnen gefunden', false, 'keine PDF-Zeile im Dateibaum');
  }
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
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length ? 1 : 0);
