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

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen ' : 'ROT   '} ${was}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
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
    (window.__cspVerstoesse ||= []).push({
      richtlinie: e.effectiveDirective || e.violatedDirective,
      quelle: (e.blockedURI || '').slice(0, 200),
      zeile: e.lineNumber,
    });
  });
});

async function eingesammelt() {
  const ausSeite = await page.evaluate(() => window.__cspVerstoesse || []).catch(() => []);
  return [...verstoesse, ...ausSeite.map(v => ({ quelle: 'seite', ...v }))];
}

try {
  // --- 1. Kommt die Kopfzeile ueberhaupt an? --------------------------------
  const antwort = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const kopf = antwort.headers();
  const bericht = kopf['content-security-policy-report-only'];
  const scharf = kopf['content-security-policy'];
  pruefe(
    'Das Dokument traegt eine berichtende Policy',
    !!bericht,
    bericht ? `${bericht.length} Zeichen` : 'keine'
  );
  pruefe(
    'Noch keine scharfe Policy auf dem Dokument',
    !scharf,
    scharf ? 'schon scharf' : 'wie geplant'
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
  await page.fill('input[name="username"], input[type="text"]', BENUTZER);
  await page.fill('input[type="password"]', PASSWORT);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  pruefe('Anmeldung', !page.url().includes('login'), page.url().replace(URL, '') || '/');

  // --- 3. Durch die Anwendung laufen ---------------------------------------
  // Jede Ecke, die eigene Wege zum Laden hat: Bilder, Blobs, Worker, Schrift.
  const stationen = [
    ['Arbeitsplatz', '/'],
    ['Dokumente', '/documents'],
    ['Einstellungen', '/settings'],
    ['System', '/system'],
  ];
  for (const [name, pfad] of stationen) {
    await page
      .goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch(() => {});
    await page.waitForTimeout(3500);
    const bisher = (await eingesammelt()).length;
    pruefe(`${name} ohne Verstoss`, bisher === 0, bisher ? `${bisher} bis hier` : 'sauber');
  }

  // --- 4. Das Urteil --------------------------------------------------------
  const alle = await eingesammelt();
  pruefe('Kein Verstoss im ganzen Durchlauf', alle.length === 0, `${alle.length} Meldungen`);
  if (alle.length) {
    console.log('\nWas gemeldet wurde:');
    const gesehen = new Set();
    for (const v of alle) {
      const schluessel = `${v.richtlinie || ''}|${v.quelle}|${v.text || ''}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      console.log(`  ${v.richtlinie || 'unbekannt'}  ${v.quelle}  ${v.text || ''}`);
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
