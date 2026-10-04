/**
 * Verwaltung Firmenordner im Browser, am Gerät (M5, Auftrag
 * verwaltung-firmenordner, 04.10.2026).
 *
 * Gemessen wird gegen EINEN Probe-Bereich mit Stempel (`FO_BEREICH`) und ein
 * Projekt darunter (`FO_PROJEKT`), die `verwaltung-firmenordner-abnahme.sh`
 * angelegt hat; `probe-j36-a` (`FO_A`) hat `lesen` auf dem Bereich. Der echte
 * Firmenordner wird nur gelesen, nie angefasst.
 *
 *   1. Der Baum der zwei Ebenen steht, der Bereich nennt „2 Personen" (die
 *      Verwaltung, die ihn anlegte, und das Probekonto), das Projekt hängt
 *      darunter.
 *   2. Zugeklappt: keine Stufe, keine Größe, kein Papierkorb, keine Änderungen,
 *      kein Abgleich im Dokument.
 *   3. Ein Klick zeigt die Stufen je Person: das Probekonto „lesen", die
 *      Verwaltung „schreiben". Erst jetzt stehen Größe, Papierkorb, Änderungen.
 *   4. Der Abgleich steht erst aufgeklappt da.
 *   5. KEINE ADRESSEN: kein http(s)://, keine IP, kein WebDAV, kein .local, in
 *      keinem Zustand.
 *   6. Bei 390 px rollt nichts seitlich.
 *   7. Die Stufen stehen EINMAL: der Bereich Personen hat keine Rechte-Matrix.
 *   8. Die Anleitung zum Verbinden eines Rechners steht in den Einstellungen
 *      unter „Angemeldete Rechner", mit genau einem Befehl, der in die
 *      Zwischenablage geht, für die Verwaltung und für das Probekonto; im
 *      Bereich Firmenordner steht sie nicht.
 *
 * Playwright steht nicht im Lockfile (Regel 7): die Pakete aus einem anderen
 * Checkout als Symlink nach node_modules legen und danach wieder entfernen.
 * Rückgabe 0, wenn jede Frage grün war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || 'probe-admin';
const ADMIN_PASSWORT = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || 'probe-j36-a';
const A_PASSWORT = process.env.ARASUL_A_PASSWORT || '';
const BEREICH = process.env.FO_BEREICH || '';
const PROJEKT = process.env.FO_PROJEKT || '';
const ZIEL =
  process.env.ARASUL_BILDER ||
  path.join(WURZEL, 'docs/plans/audits/2026-10-04-verwaltung-firmenordner-m5');

if (!ADMIN_PASSWORT || !A_PASSWORT) {
  console.error('Passwörter fehlen (zur Laufzeit aus Bitwarden, nie in eine Datei).');
  process.exit(1);
}
if (ADMIN === 'admin' || A === 'admin') {
  console.error('Nie das Konto admin: das ist ein echtes Konto.');
  process.exit(1);
}
if (!BEREICH || !PROJEKT) {
  console.error('FO_BEREICH und FO_PROJEKT fehlen: erst verwaltung-firmenordner-abnahme.sh.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const ADRESSE = /https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|webdav|\.local\b|\/dav\b/i;

const browser = await chromium.launch();

/** Ein eigener Kontext je Konto, mit Zwischenablage, angemeldet über das Formular. */
async function anmelden(benutzer, passwort, breite = 1440) {
  const kontext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: breite, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const seite = await kontext.newPage();
  await seite.goto(URL, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[name="username"], input[type="text"]', benutzer);
  await seite.fill('input[type="password"]', passwort);
  await seite.click('button[type="submit"]');
  await seite.waitForTimeout(4000);
  const ok = await seite.evaluate(async () => (await fetch('/api/auth/me')).ok);
  return { kontext, seite, ok };
}

async function bildGanz(seite, datei, hoehe = 1500) {
  const alt = seite.viewportSize();
  await seite.setViewportSize({ width: alt.width, height: hoehe });
  await seite.waitForTimeout(400);
  await seite.screenshot({ path: path.join(ZIEL, datei) });
  await seite.setViewportSize(alt);
}

const text = seite => seite.locator('body').innerText();
const anzahl = (seite, auswahl) => seite.locator(auswahl).count();

try {
  const admin = await anmelden(ADMIN, ADMIN_PASSWORT);
  pruefe(`Anmeldung als ${ADMIN}`, admin.ok);
  if (!admin.ok) process.exit(1);
  const s = admin.seite;

  // 1. Der Baum ------------------------------------------------------------------
  await s.goto(`${URL}/workspace/verwaltung/firmenordner`, { waitUntil: 'domcontentloaded' });
  await s.getByTestId('ordner-baum').waitFor({ timeout: 30000 });
  await s.getByTestId(`ordner-${BEREICH}`).waitFor({ timeout: 30000 });
  const personen = (await s.getByTestId(`ordner-personen-${BEREICH}`).innerText()).trim();
  pruefe('Der Bereich nennt die Zahl der Personen', personen === '2 Personen', personen);
  const zeileProjekt = s.getByTestId(`ordner-${PROJEKT}`);
  pruefe(
    'Das Projekt hängt darunter (Ebene 2, mit Weg bereich/projekt)',
    await zeileProjekt.isVisible()
  );
  const wege = await s
    .locator(
      '[data-testid="ordner-baum"] [data-testid^="ordner-"]:not([data-testid*="-personen-"]):not([data-testid*="-art-"])'
    )
    .evaluateAll(l => l.map(e => e.getAttribute('data-testid')));
  const posBereich = wege.indexOf(`ordner-${BEREICH}`);
  const posProjekt = wege.indexOf(`ordner-${PROJEKT}`);
  pruefe(
    'Das Projekt steht direkt nach seinem Bereich',
    posProjekt === posBereich + 1,
    `${posBereich}/${posProjekt}`
  );

  // 2. Zugeklappt ----------------------------------------------------------------
  for (const [was, auswahl] of [
    ['keine Stufe', '[data-testid^="recht-"]'],
    ['keine Größe (Platz)', '[data-testid^="ordner-platz-"]'],
    ['kein Papierkorb', '[data-testid^="ordner-papierkorb-"]'],
    ['keine Änderungen', '[data-testid^="ordner-aenderungen-"]'],
    ['kein Abgleich', '[data-testid="firmenordner-offen"]'],
  ]) {
    pruefe(`Zugeklappt steht ${was} im Dokument`, (await anzahl(s, auswahl)) === 0);
  }
  pruefe('Zugeklappt: keine Adresse', !ADRESSE.test(await text(s)));
  await bildGanz(s, 'baum-zugeklappt.png');

  // 3. Ein Klick zeigt die Stufen --------------------------------------------------
  await zeileProjekt.getByRole('button').first().click();
  await s.getByTestId(`rechte-${PROJEKT}`).waitFor({ timeout: 15000 });
  const zeileBereich = s.getByTestId(`ordner-${BEREICH}`);
  await zeileBereich.getByRole('button').first().click();
  await s.getByTestId(`rechte-${BEREICH}`).waitFor({ timeout: 15000 });
  const stufeA = (await s.getByTestId(`recht-${BEREICH}-${A}`).innerText()).trim();
  const stufeAdmin = (await s.getByTestId(`recht-${BEREICH}-${ADMIN}`).innerText()).trim();
  pruefe(`Ein Klick zeigt die Stufe von ${A}: lesen`, stufeA === 'lesen', stufeA);
  pruefe(`und die der Verwaltung (${ADMIN}): schreiben`, stufeAdmin === 'schreiben', stufeAdmin);
  const stufeProjekt = (await s.getByTestId(`recht-${PROJEKT}-${A}`).innerText()).trim();
  pruefe('Das Projekt sagt, was von oben gilt', /wie oben: lesen/.test(stufeProjekt), stufeProjekt);
  for (const [was, auswahl] of [
    ['Größe', `[data-testid="ordner-platz-${BEREICH}"]`],
    ['Papierkorb', `[data-testid="ordner-papierkorb-${BEREICH}"]`],
    ['Änderungen', `[data-testid="ordner-aenderungen-${BEREICH}"]`],
  ]) {
    pruefe(`Aufgeklappt steht ${was}`, (await anzahl(s, auswahl)) === 1);
  }
  pruefe('Aufgeklappt: keine Adresse', !ADRESSE.test(await text(s)));
  await bildGanz(s, 'baum-aufgeklappt.png');

  // Die Änderungen öffnen sich im Dialog, ohne dass eine Adresse darin steht.
  await s.getByTestId(`ordner-aenderungen-${BEREICH}`).click();
  await s.getByTestId('ordner-aenderungen').waitFor({ timeout: 15000 });
  pruefe('Die Änderungen öffnen sich', true);
  await bildGanz(s, 'aenderungen.png');
  await s.keyboard.press('Escape');
  await s.waitForTimeout(500);

  // 4. Abgleich ------------------------------------------------------------------
  const abschnitt = s.getByTestId('firmenordner-abgleich-abschnitt');
  pruefe(
    'Der Abgleich steht zugeklappt da',
    (await anzahl(s, '[data-testid="firmenordner-offen"]')) === 0
  );
  await abschnitt.getByRole('button').click();
  await s.getByTestId('firmenordner-offen').waitFor({ timeout: 10000 });
  pruefe(
    'Aufgeklappt sagt der Abgleich, wie es steht',
    (await s.getByTestId('firmenordner-offen').innerText()).length > 0
  );
  pruefe('Mit Abgleich aufgeklappt: keine Adresse', !ADRESSE.test(await text(s)));
  await bildGanz(s, 'abgleich-aufgeklappt.png');

  // 5./6. Die Anleitung steht hier nicht, die Seite bleibt schmal heil -----------------
  pruefe(
    'Im Bereich Firmenordner steht keine Anleitung (eine Stelle je Funktion)',
    (await anzahl(s, '[data-testid="rechner-verbinden"]')) === 0
  );
  await s.setViewportSize({ width: 390, height: 900 });
  await s.waitForTimeout(600);
  const ueberlauf = await s.evaluate(() => {
    const b = document.querySelector('[data-testid="ordner-baum"]');
    return b ? b.scrollWidth - b.clientWidth : -1;
  });
  pruefe('Bei 390 px rollt der Baum nicht seitlich', ueberlauf === 0, `Überlauf ${ueberlauf}`);
  await bildGanz(s, 'baum-schmal.png', 1800);
  await s.setViewportSize({ width: 1440, height: 900 });

  // 7. Die Stufen stehen einmal ------------------------------------------------------
  await s.goto(`${URL}/workspace/verwaltung/personen`, { waitUntil: 'domcontentloaded' });
  await s.getByTestId('personen-seite').waitFor({ timeout: 30000 });
  await s.waitForTimeout(1500);
  pruefe(
    'Personen hat keine Rechte-Matrix',
    (await anzahl(s, '[data-testid="rechte-matrix"]')) === 0
  );
  pruefe('und keine Stufe auf einem Ordner', (await anzahl(s, '[data-testid^="recht-"]')) === 0);
  pruefe('und keine Überschrift „Freigaben: Ordner"', !/Freigaben: Ordner/.test(await text(s)));
  await bildGanz(s, 'personen-ohne-ordnerrechte.png');

  // 8. Die Anleitung in den Einstellungen --------------------------------------------
  async function anleitung(konto, seite, benutzername, datei) {
    await seite.goto(`${URL}/workspace/settings`, { waitUntil: 'domcontentloaded' });
    await seite.getByTestId('rechner-verbinden').waitFor({ timeout: 30000 });
    pruefe(
      `${konto}: genau ein Befehl steht da`,
      (await anzahl(seite, '[data-testid="rechner-verbinden-befehl"]')) === 1
    );
    const befehl = (await seite.getByTestId('rechner-verbinden-befehl').innerText()).trim();
    pruefe(
      `${konto}: der Befehl nennt Gerät und Person`,
      befehl.startsWith(`node arasul.mjs login ${new globalThis.URL(URL).origin} --user `) &&
        befehl.length > 40,
      befehl
    );
    pruefe(
      `${konto}: die Anleitung steht unter „Angemeldete Rechner"`,
      (await seite.getByRole('heading', { level: 2, name: 'Angemeldete Rechner' }).count()) === 1
    );
    await seite.getByTestId('rechner-verbinden-kopieren').click();
    await seite.waitForTimeout(400);
    const kopiert = await seite.evaluate(() => navigator.clipboard.readText());
    pruefe(`${konto}: der Knopf kopiert genau diesen Befehl`, kopiert === befehl, kopiert);
    await bildGanz(seite, datei, 1100);
    return befehl;
  }
  await anleitung('Verwaltung', s, ADMIN, 'einstellungen-anleitung-verwaltung.png');

  const mitarbeiter = await anmelden(A, A_PASSWORT);
  pruefe(`Anmeldung als ${A}`, mitarbeiter.ok);
  if (mitarbeiter.ok) {
    const befehl = await anleitung(
      'Mitarbeiter',
      mitarbeiter.seite,
      A,
      'einstellungen-anleitung-mitarbeiter.png'
    );
    pruefe(
      'Der Mitarbeiter sieht die Anleitung, ohne Zugang zur Verwaltung',
      /--user \S+$/.test(befehl) &&
        (await anzahl(mitarbeiter.seite, '[data-testid="firmenordner-seite"]')) === 0
    );
    await mitarbeiter.kontext.close();
  }
  await admin.kontext.close();
} catch (fehler) {
  pruefe('Der Lauf brach nicht ab', false, String(fehler).slice(0, 300));
} finally {
  await browser.close();
}
console.log(rot === 0 ? 'Browser-Teil grün.' : `${rot} rot.`);
process.exit(rot === 0 ? 0 : 1);
