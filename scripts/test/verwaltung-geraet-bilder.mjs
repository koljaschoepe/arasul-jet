/**
 * Die Bereiche System und Gerät der Verwaltung im Browser, am Gerät (M5,
 * Auftrag verwaltung-geraet-und-system). Bilder und die Fragen, die ein Bild
 * nicht beantwortet:
 *
 *   1. Die Leiste der Verwaltung nennt genau Personen, Apps, Firmenordner,
 *      Modelle, System, Daten, Gerät, in dieser Reihenfolge.
 *   2. Die alten Adressen (Allgemein, Lizenz, Fernzugriff, Sicherheit, KI,
 *      Aktualisierungen) landen dort, wo die Funktion jetzt steht.
 *   3. System: ein Satz, drei Zahlen, Dienste und Selbstheilung zugeklappt.
 *   4. Gerät: Unternehmen als Text, das Formular erst auf „Bearbeiten“; Name
 *      und Logo werden VORHER gelesen, für die Messung gesetzt, die
 *      Aktivitätsleiste zeigt das Logo, die Anmeldeseite den Namen, danach wird
 *      beides über die Oberfläche EXAKT zurückgesetzt (und im `finally` über
 *      die Schnittstelle, falls etwas abbricht).
 *   5. Aktualisierung: „Hier läuft Fassung …“; der Knopf führt NUR bis in die
 *      Bestätigung. Die Abfrage nach der neuesten Fassung wird dafür im Browser
 *      mit einer erfundenen Fassung beantwortet, und JEDER schreibende Aufruf an
 *      `/api/update/`, `/api/tailscale/` und `/api/license/activate` wird im
 *      Browser abgewiesen und gezählt: er muss null bleiben.
 *   6. Lizenz: drei Zahlen, Einspielen im Dialog, Fingerabdruck aufgeklappt.
 *   7. Fernzugriff: Schalter an, mit Adresse; Technik erst aufgeklappt. Der
 *      Schalter wird NIE angeklickt (der Zugang zum Orin läuft darüber).
 *   8. Begriffe aus der Technik stehen nur aufgeklappt; die Fassung steht
 *      einmal; kein Basis-Prompt.
 *   9. Bei 390 px läuft nichts über den Rand.
 *
 * Aufruf (Tunnel: ssh -f -N -L 8443:localhost:443 jetson):
 *   ARASUL_URL=https://localhost:8443 ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/verwaltung-geraet-bilder.mjs
 *
 * Playwright steht nicht im Lockfile (Regel 7); die Pakete aus einem anderen
 * Checkout als Symlink nach node_modules legen und danach wieder entfernen.
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { angemeldeteSeite, hinweisWeg } from './anmeldung.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'probe-admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const STEMPEL =
  process.env.ARASUL_STEMPEL || new Date().toISOString().slice(11, 19).replaceAll(':', '');
const PROBE_NAME = `Probe Gerät 1004-${STEMPEL}`;
const ZIEL =
  process.env.ARASUL_BILDER ||
  path.join(WURZEL, 'docs/plans/audits/2026-10-04-verwaltung-geraet-m5');

if (!PASSWORT) {
  console.error('ARASUL_PASSWORT fehlt (zur Laufzeit aus Bitwarden, nie in eine Datei).');
  process.exit(1);
}
if (BENUTZER === 'admin') {
  console.error('Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

/** Ein kleines PNG (32 x 32, ein Blau), ohne Bibliothek. */
function probePng() {
  const crcTabelle = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = buf => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTabelle[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const stueck = (art, daten) => {
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(daten.length);
    const kopf = Buffer.concat([Buffer.from(art, 'latin1'), daten]);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(crc(kopf));
    return Buffer.concat([laenge, kopf, pruef]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(32, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const zeile = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(32).fill([0x25, 0x63, 0xeb, 0xff]).flat()),
  ]);
  const roh = Buffer.concat(Array(32).fill(zeile));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    stueck('IHDR', ihdr),
    stueck('IDAT', zlib.deflateSync(roh)),
    stueck('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const { seite, kontext, angemeldet, grund } = await angemeldeteSeite(
  speicher =>
    browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: speicher,
      viewport: { width: 1440, height: 900 },
    }),
  { url: URL, benutzer: BENUTZER, passwort: PASSWORT }
);

// SCHUTZ: kein Einspielen, kein Umschalten, keine Lizenz. Jeder schreibende
// Aufruf an diese Wege wird im Browser abgewiesen und gezählt.
const abgewiesen = [];
await kontext.route(/\/api\/(update\/|tailscale\/|license\/activate)/, async route => {
  if (route.request().method() !== 'GET') {
    abgewiesen.push(
      `${route.request().method()} ${new globalThis.URL(route.request().url()).pathname}`
    );
    return route.abort();
  }
  return route.fallback();
});

const csrf = async () => (await kontext.cookies()).find(c => c.name === 'arasul_csrf')?.value || '';
async function api(verb, pfad, data) {
  const antwort = await kontext.request.fetch(`${URL}${pfad}`, {
    method: verb,
    headers: { 'X-CSRF-Token': await csrf() },
    ...(data ? { data } : {}),
  });
  let rumpf = null;
  try {
    rumpf = await antwort.json();
  } catch {
    rumpf = null;
  }
  return { status: antwort.status(), rumpf };
}

/** Ein Bild der ganzen Seite: der Rollbereich der Verwaltung ist kein Dokument. */
async function bildGanz(datei, hoehe = 2000) {
  const alt = seite.viewportSize();
  await seite.setViewportSize({ width: alt.width, height: hoehe });
  await seite.waitForTimeout(400);
  await seite.screenshot({ path: path.join(ZIEL, datei) });
  await seite.setViewportSize(alt);
}

const zeigeGeraet = async () => {
  await seite.goto(`${URL}/workspace/verwaltung/geraet`);
  await seite.getByTestId('geraet-seite').waitFor({ timeout: 30000 });
  await seite.getByTestId('lizenz-stufe').waitFor({ timeout: 30000 });
  await hinweisWeg(seite);
};

// Vorher lesen: Name und Logo (als Datei), damit am Ende EXAKT dasselbe dasteht.
const vorher = await api('GET', '/api/auth/needs-setup');
const NAME_VORHER = vorher.rumpf?.firmenname ?? null;
const LOGO_VORHER = vorher.rumpf?.logo ?? null;
let logoVorherBild = null;
if (LOGO_VORHER) {
  const r = await kontext.request.get(
    `${URL}/api/darstellung/logo?stand=${encodeURIComponent(LOGO_VORHER)}`
  );
  logoVorherBild = {
    typ: r.headers()['content-type'],
    daten: (await r.body()).toString('base64'),
  };
}
console.log(`vorher: Name »${NAME_VORHER ?? '<keiner>'}«, Logo ${LOGO_VORHER ?? '<keines>'}`);

async function zuruecksetzen() {
  if (logoVorherBild) {
    await api('PUT', '/api/settings/logo', {
      bild: `data:${logoVorherBild.typ};base64,${logoVorherBild.daten}`,
    });
  } else {
    await api('DELETE', '/api/settings/logo');
  }
  await api('PUT', '/api/settings/firmenname', { firmenname: NAME_VORHER ?? '' });
}

try {
  pruefe(`Anmeldung als ${BENUTZER}`, angemeldet, grund || '');
  if (!angemeldet) process.exit(1);
  await hinweisWeg(seite);

  // --- 1. Leiste der Verwaltung -----------------------------------------------------
  await seite.getByTestId('leiste-verwaltung').click();
  await seite.getByTestId('verwaltung-bereiche').waitFor({ timeout: 30000 });
  const bereiche = await seite
    .getByTestId('verwaltung-bereiche')
    .locator('[data-testid^="verwaltung-"]')
    .allInnerTexts();
  pruefe(
    'Die Leiste nennt Personen, Apps, Firmenordner, Modelle, System, Daten, Gerät',
    bereiche.map(t => t.trim()).join(',') ===
      'Personen,Apps,Firmenordner,Modelle,System,Daten,Gerät',
    bereiche.map(t => t.trim()).join(', ')
  );

  // --- 2. Alte Adressen -------------------------------------------------------------
  for (const [alt, neu] of [
    ['/workspace/verwaltung/general', '/workspace/verwaltung/geraet/unternehmen'],
    ['/workspace/verwaltung/lizenz', '/workspace/verwaltung/geraet/lizenz'],
    ['/workspace/verwaltung/remote-access', '/workspace/verwaltung/geraet/fernzugriff'],
    ['/workspace/verwaltung/security', '/workspace/verwaltung/geraet/fernzugriff'],
    ['/workspace/verwaltung/system/updates', '/workspace/verwaltung/geraet/aktualisierung'],
    ['/settings?tab=remote-access', '/workspace/verwaltung/geraet/fernzugriff'],
    ['/workspace/verwaltung/ki', '/workspace/verwaltung/modelle'],
  ]) {
    await seite.goto(`${URL}${alt}`);
    await seite.waitForURL(u => u.pathname === neu, { timeout: 30000 }).catch(() => undefined);
    pruefe(
      `${alt} landet auf ${neu}`,
      new globalThis.URL(seite.url()).pathname === neu,
      seite.url().replace(URL, '')
    );
  }

  // --- 3. System --------------------------------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/system`);
  await seite.getByTestId('system-seite').waitFor({ timeout: 30000 });
  await seite.waitForFunction(
    () =>
      !/Wird geprüft/.test(
        document.querySelector('[data-testid="system-satz"]')?.textContent || ''
      ),
    null,
    { timeout: 30000 }
  );
  const satz = (await seite.getByTestId('system-satz').innerText()).trim();
  const zahlen = await seite.getByTestId('system-zahlen').innerText();
  pruefe('System: ein Satz', satz.length > 0 && !satz.includes('\n'), satz);
  pruefe(
    'System: Prozessor, Speicher und Platte als drei Zahlen',
    /Prozessor/i.test(zahlen) &&
      /Speicher/i.test(zahlen) &&
      /Platte/i.test(zahlen) &&
      (zahlen.match(/\d/g) || []).length >= 3,
    zahlen.replace(/\s+/g, ' ')
  );
  const dienste = seite.getByRole('button', { name: 'Dienste' });
  const heilung = seite.getByRole('button', { name: 'Selbstheilung' });
  pruefe(
    'System: Dienste und Selbstheilung stehen zugeklappt da',
    (await dienste.getAttribute('aria-expanded')) === 'false' &&
      (await heilung.getAttribute('aria-expanded')) === 'false'
  );
  pruefe(
    'System: keine Auslastung, keine Aktualisierungen mehr',
    (await seite.getByRole('button', { name: 'Auslastung' }).count()) === 0 &&
      (await seite.getByRole('button', { name: 'Aktualisierungen' }).count()) === 0
  );
  await seite.screenshot({ path: path.join(ZIEL, 'system.png') });
  await dienste.click();
  await seite.waitForTimeout(1500);
  await bildGanz('system-dienste-aufgeklappt.png', 1600);

  // --- 4. Gerät: Unternehmen --------------------------------------------------------
  await zeigeGeraet();
  await seite.getByTestId('fassung-hier').waitFor({ timeout: 30000 });
  await seite.waitForTimeout(800);
  await bildGanz('geraet.png');
  pruefe(
    'Unternehmen: als Text, kein Formular ohne „Bearbeiten“',
    (await seite.getByTestId('unternehmen-name').count()) === 1 &&
      (await seite.getByTestId('unternehmen-formular').count()) === 0
  );
  await seite.getByTestId('unternehmen-bearbeiten').click();
  await seite.getByTestId('unternehmen-formular').waitFor({ timeout: 10000 });
  await seite.locator('#firmenname').fill(PROBE_NAME);
  const pngDatei = path.join(ZIEL, '.probe-logo.png');
  fs.writeFileSync(pngDatei, probePng());
  await seite.getByTestId('unternehmen-logo-datei').setInputFiles(pngDatei);
  fs.unlinkSync(pngDatei);
  await seite.getByTestId('unternehmen-logo-vorschau').waitFor({ timeout: 10000 });
  await seite.screenshot({ path: path.join(ZIEL, 'unternehmen-bearbeiten.png') });
  await seite.getByTestId('unternehmen-speichern').click();
  await seite.getByTestId('unternehmen-formular').waitFor({ state: 'detached', timeout: 30000 });
  await seite.getByTestId('leiste-logo').waitFor({ timeout: 30000 });
  const logoGeladen = await seite
    .getByTestId('leiste-logo')
    .evaluate(img => img.complete && img.naturalWidth === 32);
  pruefe('Unternehmen: die Aktivitätsleiste zeigt das Logo über dem Haus, sofort', logoGeladen);
  pruefe(
    'Unternehmen: der Name steht als Text',
    (await seite.getByTestId('unternehmen-name').innerText()).trim() === PROBE_NAME
  );
  await seite.screenshot({
    path: path.join(ZIEL, 'leiste-mit-logo.png'),
    clip: { x: 0, y: 0, width: 480, height: 300 },
  });

  // Die Anmeldeseite (ohne Sitzung) nennt den Namen.
  const fremd = await browser.newContext({ ignoreHTTPSErrors: true });
  const anmeldung = await fremd.newPage();
  await anmeldung.goto(URL);
  await anmeldung
    .getByText(PROBE_NAME)
    .waitFor({ timeout: 30000 })
    .catch(() => undefined);
  pruefe(
    'Unternehmen: die Anmeldeseite nennt den Namen',
    (await anmeldung.getByText(PROBE_NAME).count()) > 0
  );
  await anmeldung.screenshot({ path: path.join(ZIEL, 'anmeldung-mit-name.png') });
  await fremd.close();

  // Zurücksetzen über die Oberfläche, so wie ein Administrator es täte.
  await seite.getByTestId('unternehmen-bearbeiten').click();
  await seite.locator('#firmenname').fill(NAME_VORHER ?? '');
  if (!LOGO_VORHER) await seite.getByTestId('unternehmen-logo-entfernen').click();
  await seite.getByTestId('unternehmen-speichern').click();
  await seite.getByTestId('unternehmen-formular').waitFor({ state: 'detached', timeout: 30000 });
  if (LOGO_VORHER) await zuruecksetzen();
  const nachher = await api('GET', '/api/auth/needs-setup');
  pruefe(
    'Unternehmen: Name und Logo sind wieder wie vorher',
    (nachher.rumpf?.firmenname ?? null) === NAME_VORHER &&
      (LOGO_VORHER ? nachher.rumpf?.logo != null : nachher.rumpf?.logo == null),
    `»${nachher.rumpf?.firmenname ?? '<keiner>'}«, Logo ${nachher.rumpf?.logo ?? '<keines>'}`
  );
  if (!LOGO_VORHER) {
    await seite
      .getByTestId('leiste-logo')
      .waitFor({ state: 'detached', timeout: 30000 })
      .catch(() => undefined);
    pruefe(
      'Unternehmen: ohne Logo steht in der Leiste nichts',
      (await seite.getByTestId('leiste-logo').count()) === 0
    );
  }

  // --- 5. Aktualisierung: bis in die Bestätigung -------------------------------------
  const hier = (await seite.getByTestId('fassung-hier').innerText()).trim();
  pruefe('Aktualisierung: „Hier läuft Fassung …“', /^Hier läuft Fassung .+\.$/.test(hier), hier);
  const fassung = hier.replace(/^Hier läuft Fassung /, '').replace(/\.$/, '');
  const geraetText = await seite.getByTestId('geraet-seite').innerText();
  pruefe(
    'Die Fassung steht genau einmal auf der Seite',
    geraetText.split(fassung).length - 1 === 1,
    `${geraetText.split(fassung).length - 1}× „${fassung}“`
  );

  // Eine erfundene neuere Fassung, nur im Browser: so lässt sich der Knopf
  // zeigen, ohne dass es am Gerät eine gibt.
  await seite.route('**/api/update/fassung/neueste', route =>
    route.fulfill({ json: { data: { fassung: '9.9.9' }, timestamp: new Date().toISOString() } })
  );
  await zeigeGeraet();
  const knopf = seite.getByTestId('fassung-einspielen');
  await knopf.waitFor({ timeout: 30000 });
  pruefe(
    'Aktualisierung: ein Knopf, wenn es eine neuere gibt',
    (await knopf.innerText()).includes('9.9.9')
  );
  await knopf.click();
  const dialog = seite.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 10000 });
  pruefe(
    'Aktualisierung: der Knopf fragt erst nach und sagt, dass vorher gesichert wird',
    /sichert vorher/.test(await dialog.innerText())
  );
  // Der Dialog blendet ein; vorher zeigt das Bild ihn noch nicht.
  await seite.waitForTimeout(600);
  await seite.screenshot({ path: path.join(ZIEL, 'aktualisierung-bestaetigung.png') });
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  await seite.unroute('**/api/update/fassung/neueste');

  // --- 6. Lizenz ----------------------------------------------------------------------
  const lizenz = seite.getByTestId('lizenz-seite');
  pruefe(
    'Lizenz: Stufe, Personen, gültig bis',
    (await seite.getByTestId('lizenz-stufe').innerText()).trim().length > 0 &&
      /\d/.test(await seite.getByTestId('lizenz-konten').innerText()) &&
      (await seite.getByTestId('lizenz-bis').innerText()).trim().length > 0,
    `${await seite.getByTestId('lizenz-stufe').innerText()}, ${await seite.getByTestId('lizenz-konten').innerText()}, ${await seite.getByTestId('lizenz-bis').innerText()}`
  );
  pruefe(
    'Lizenz: der Fingerabdruck steht zugeklappt',
    (await seite.getByTestId('lizenz-fingerabdruck').count()) === 0
  );
  await seite.getByTestId('lizenz-mehr-knopf').click();
  pruefe(
    'Lizenz: aufgeklappt steht der Fingerabdruck',
    (await seite.getByTestId('lizenz-fingerabdruck').innerText()).trim().length >= 16
  );
  await lizenz.screenshot({ path: path.join(ZIEL, 'lizenz-aufgeklappt.png') });
  await seite.getByTestId('lizenz-einspielen-oeffnen').click();
  await seite.getByTestId('lizenz-feld').waitFor({ timeout: 10000 });
  pruefe(
    'Lizenz: Einspielen ist ein Dialog, der Knopf ohne Text gesperrt',
    await seite.getByTestId('lizenz-einspielen').isDisabled()
  );
  await seite.waitForTimeout(600);
  await seite.screenshot({ path: path.join(ZIEL, 'lizenz-einspielen-dialog.png') });
  await seite.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();

  // --- 7. Fernzugriff -----------------------------------------------------------------
  await zeigeGeraet();
  const schalter = seite.getByTestId('fernzugriff-schalter');
  await seite.getByTestId('fernzugriff-adresse').waitFor({ timeout: 30000 });
  pruefe(
    'Fernzugriff: der Schalter steht an',
    (await schalter.getAttribute('aria-checked')) === 'true'
  );
  pruefe(
    'Fernzugriff: mit Adresse',
    /^https:\/\/.+/.test((await seite.getByTestId('fernzugriff-adresse').innerText()).trim()),
    (await seite.getByTestId('fernzugriff-adresse').innerText()).trim()
  );
  const fern = seite.getByTestId('fernzugriff');

  // --- 8. Begriffe aus der Technik nur aufgeklappt ---------------------------------
  const zugeklappt = await seite.getByTestId('geraet-seite').innerText();
  const technik = [
    'Tailscale',
    'Tailnet',
    'JetPack',
    'Versionskennung',
    'SSH',
    'DNS',
    'Prompt',
    'Token',
    'docker',
    '.araupdate',
    'Build',
    'IP ',
  ];
  const funde = technik.filter(w => zugeklappt.includes(w));
  pruefe(
    'Gerät: keine Begriffe aus der Technik, solange nichts aufgeklappt ist',
    funde.length === 0,
    funde.join(', ')
  );
  const systemText = await (async () => {
    await seite.goto(`${URL}/workspace/verwaltung/system`);
    await seite.getByTestId('system-seite').waitFor({ timeout: 30000 });
    return seite.getByTestId('system-seite').innerText();
  })();
  const systemFunde = ['Swap', 'Auslagerung', 'CPU', 'RAM', 'GPU', 'Health', 'OK'].filter(w =>
    new RegExp(`\\b${w}\\b`).test(systemText)
  );
  pruefe(
    'System: keine Begriffe aus der Technik',
    systemFunde.length === 0,
    systemFunde.join(', ')
  );
  await zeigeGeraet();
  await seite.getByTestId('fernzugriff-technik-knopf').click();
  await seite.getByTestId('fernzugriff-technik').waitFor({ timeout: 10000 });
  pruefe(
    'Fernzugriff: aufgeklappt steht die Technik',
    /Tailnet/.test(await seite.getByTestId('fernzugriff-technik').innerText())
  );
  await fern.screenshot({ path: path.join(ZIEL, 'fernzugriff-technik.png') });

  // --- 9. Schmal ------------------------------------------------------------------------
  await seite.setViewportSize({ width: 390, height: 844 });
  await zeigeGeraet();
  const breite = await seite.evaluate(() => document.documentElement.scrollWidth);
  pruefe('Bei 390 px läuft nichts über den Rand', breite <= 392, `${breite} px`);
  // Für das Bild: warten, bis Fernzugriff und Aktualisierung geantwortet haben.
  const t0 = Date.now();
  const geladen = await seite
    .getByTestId('fernzugriff-adresse')
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  console.log(
    `       (Fernzugriff bei 390 px ${geladen ? `nach ${Date.now() - t0} ms` : 'nach 30 s noch nicht'} geladen)`
  );
  await seite
    .getByTestId('fassung-aktuell')
    .waitFor({ timeout: 30000 })
    .catch(() => undefined);
  await bildGanz('geraet-schmal.png', 3000);

  pruefe(
    'Kein schreibender Aufruf an Aktualisierung, Fernzugriff oder Lizenz',
    abgewiesen.length === 0,
    abgewiesen.join(', ')
  );
} finally {
  await zuruecksetzen().catch(err => console.error(`Zurücksetzen gescheitert: ${err.message}`));
  const ende = await api('GET', '/api/auth/needs-setup').catch(() => null);
  console.log(
    `zurückgesetzt: Name »${ende?.rumpf?.firmenname ?? '<keiner>'}«, Logo ${ende?.rumpf?.logo ?? '<keines>'}`
  );
  await browser.close();
}

console.log(rot === 0 ? '\nalles gruen' : `\n${rot} ROT`);
process.exit(rot === 0 ? 0 : 1);
