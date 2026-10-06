/**
 * Der Bereich Läufe der Verwaltung im Browser, am Gerät (M5, Auftrag
 * verwaltung-laeufe). Bilder und die Fragen, die ein Bild nicht beantwortet.
 * Gelaufen wird gegen die Läufe, die `verwaltung-laeufe-abnahme.sh` erzeugt hat
 * (zwei Probe-Apps, Läufe von Hand, per Zeitplan und per Ereignis); die
 * Nummern kommen aus der Umgebung.
 *
 *   1. Die Leiste der Verwaltung nennt Personen, Apps, Läufe, Firmenordner,
 *      Modelle, System, Daten, Gerät, Läufe zwischen Apps und Firmenordner.
 *   2. Die Liste nennt Läufe beider Apps; Fehler und „nicht übergeben" oben.
 *   3. Filter nach App, Ergebnis, Person („ohne Person") und Zeitraum wirken,
 *      jeder in zwei Klicks, und stehen in der Adresse; frisch geladen bleibt
 *      die Auswahl.
 *   4. Mehrere Läufe klappen zugleich auf; Schritte klappen bis zu Ein- und
 *      Ausgabe auf; ein Fehler nennt seinen Grund.
 *   5. Der Link jedes Laufs öffnet genau diesen einen Lauf, auch frisch
 *      geladen; Auslöser und Person stehen dabei; ein Lauf, den es nicht gibt,
 *      sagt es.
 *   6. Die Seite einer App zeigt keine zweite Liste, nur den Weg hierher, und
 *      der Weg führt mit der App als Filter in die Läufe.
 *   7. Bei 390 px läuft nichts über den Rand.
 *
 * Aufruf (Tunnel: ssh -f -N -L 8443:localhost:443 jetson), meist aus
 * `verwaltung-laeufe-abnahme.sh`, das die Umgebung setzt.
 *
 * Playwright steht nicht im Lockfile (Regel 7); die Pakete aus einem anderen
 * Checkout als Symlink nach node_modules legen und danach wieder entfernen.
 * Rückgabe 0, wenn jede Frage grün war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { angemeldeteSeite, hinweisWeg } from './anmeldung.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'probe-admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const ZIEL =
  process.env.ARASUL_BILDER ||
  path.join(WURZEL, 'docs/plans/audits/2026-10-04-verwaltung-laeufe-m5');
const env = name => process.env[name] || '';
const APP_A = env('LAEUFE_APP_A');
const APP_B = env('LAEUFE_APP_B');
const ID_A = env('LAEUFE_ID_A');
const HAND_A = env('LAEUFE_HAND_A');
const HAND_OHNE = env('LAEUFE_HAND_OHNE');
const KAPUTT = env('LAEUFE_KAPUTT');
const EINGEFUEGT = env('LAEUFE_EINGEFUEGT');
const HAND_B = env('LAEUFE_HAND_B');
const EREIGNIS_A = env('LAEUFE_EREIGNIS_A');
const EREIGNIS_B_OHNE = env('LAEUFE_EREIGNIS_B_OHNE');
const ZEITPLAN = env('LAEUFE_ZEITPLAN');

if (!PASSWORT) {
  console.error('ARASUL_PASSWORT fehlt (zur Laufzeit aus Bitwarden, nie in eine Datei).');
  process.exit(1);
}
if (BENUTZER === 'admin') {
  console.error('Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen.');
  process.exit(1);
}
if (!APP_A || !APP_B || !HAND_A || !KAPUTT || !EREIGNIS_A || !HAND_B) {
  console.error('Die Läufe der Abnahme fehlen (LAEUFE_*): erst verwaltung-laeufe-abnahme.sh.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const { seite, angemeldet, grund } = await angemeldeteSeite(
  speicher =>
    browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: speicher,
      viewport: { width: 1440, height: 900 },
    }),
  { url: URL, benutzer: BENUTZER, passwort: PASSWORT }
);

/** Ein Bild der ganzen Seite: der Rollbereich der Verwaltung ist kein Dokument. */
async function bildGanz(datei, hoehe = 1500) {
  const alt = seite.viewportSize();
  await seite.setViewportSize({ width: alt.width, height: hoehe });
  await seite.waitForTimeout(400);
  await seite.screenshot({ path: path.join(ZIEL, datei) });
  await seite.setViewportSize(alt);
}

const pfad = () => {
  const u = new globalThis.URL(seite.url());
  return u.pathname + u.search;
};

/** Die Zeilen der Liste: Nummer → { status, app, wer }. */
async function zeilen() {
  return seite.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="lauf-zeile-"]')).map(z => {
      const id = z.getAttribute('data-testid').replace('lauf-zeile-', '');
      const text = t => z.querySelector(`[data-testid="${t}-${id}"]`)?.textContent?.trim() ?? '';
      return {
        id,
        status: z.getAttribute('data-lauf-status'),
        app: text('lauf-app'),
        wer: text('lauf-wer'),
      };
    })
  );
}

/** Warten, bis die Liste da ist (oder der Leerzustand), nicht bis das Gerüst da ist. */
async function listeDa() {
  await seite
    .locator('[data-testid="laeufe-liste"], [data-testid="laeufe-fehler"]')
    .or(seite.getByText(/Kein Lauf mit dieser Auswahl|Noch kein Lauf/))
    .first()
    .waitFor({ timeout: 30000 });
  await seite.waitForTimeout(500);
}

/** Einen Filter wählen: Auswahlfeld öffnen, Eintrag nehmen. Zwei Klicks. */
async function waehle(filter, eintrag) {
  await seite.getByTestId(`laeufe-filter-${filter}`).click();
  await seite.getByRole('option', { name: eintrag }).click();
  await seite.waitForTimeout(700);
}

const NUMMERN = [HAND_A, HAND_OHNE, KAPUTT, EINGEFUEGT, HAND_B, EREIGNIS_A, EREIGNIS_B_OHNE]
  .filter(Boolean)
  .map(String);

try {
  pruefe(`Anmeldung als ${BENUTZER}`, angemeldet, grund || '');
  if (!angemeldet) process.exit(1);
  await hinweisWeg(seite);

  // --- 1. Leiste ---------------------------------------------------------------------
  await seite.getByTestId('leiste-verwaltung').click();
  await seite.getByTestId('verwaltung-bereiche').waitFor({ timeout: 30000 });
  const bereiche = (
    await seite
      .getByTestId('verwaltung-bereiche')
      .locator('[data-testid^="verwaltung-"]')
      .allInnerTexts()
  )
    .map(t => t.trim())
    .join(',');
  pruefe(
    'Die Leiste nennt Läufe zwischen Apps und Firmenordner',
    bereiche === 'Personen,Apps,Läufe,Firmenordner,Modelle,System,Daten,Gerät',
    bereiche
  );

  // --- 2. Liste, Fehler oben ----------------------------------------------------------
  await seite.getByTestId('verwaltung-laeufe').click();
  await seite.getByTestId('laeufe-seite').waitFor({ timeout: 30000 });
  await listeDa();
  pruefe('Läufe hat eine Adresse', pfad() === '/workspace/verwaltung/laeufe', pfad());
  // Ohne Filter stehen auch fremde Läufe da; ein Zeitraum ab heute macht die Liste kurz genug.
  const heute = new Date().toLocaleDateString('sv-SE'); // JJJJ-MM-TT, Zeit des Browsers
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?von=${heute}`);
  await listeDa();
  await bildGanz('laeufe-liste.png');
  const alle = await zeilen();
  const ids = alle.map(z => z.id);
  pruefe(
    'Die Liste nennt Läufe beider Apps',
    ids.includes(String(HAND_A)) && ids.includes(String(HAND_B)),
    `${alle.length} Zeilen`
  );
  const schlecht = alle.map(z => z.status === 'fehler' || z.status === 'nicht_uebergeben');
  const ersteGute = schlecht.indexOf(false);
  pruefe(
    'Fehler und „nicht übergeben" stehen oben',
    schlecht.some(Boolean) && ersteGute > 0 && !schlecht.slice(ersteGute).some(Boolean),
    alle
      .slice(0, 4)
      .map(z => `${z.id}:${z.status}`)
      .join(' ')
  );

  // --- 3. Filter: App ---------------------------------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/laeufe`);
  await listeDa();
  const nameA = `Probe: Läufe (${APP_A.split('-').pop()})`;
  await waehle('app', nameA);
  const nachApp = await zeilen();
  pruefe(
    'Filter App: zwei Klicks, und die Liste nennt nur Läufe dieser App',
    nachApp.length > 0 && nachApp.every(z => z.app.startsWith(nameA)),
    `${nachApp.length} Zeilen`
  );
  pruefe('… die App steht in der Adresse', pfad().includes(`app=${APP_A}`), pfad());
  const zuerst = nachApp.slice(0, 2).map(z => z.id);
  pruefe(
    '… Fehler und der „nicht übergebene" Lauf stehen oben',
    EINGEFUEGT
      ? zuerst.includes(String(KAPUTT)) && zuerst.includes(String(EINGEFUEGT))
      : zuerst.includes(String(KAPUTT)),
    zuerst.join(', ')
  );
  await bildGanz('laeufe-gefiltert-app.png');

  // --- Filter: Ergebnis ---------------------------------------------------------------------
  await waehle('status', 'Fehler');
  const fehlerZeilen = await zeilen();
  pruefe(
    'Filter Ergebnis „Fehler": nur Fehler, der kaputte Lauf darunter',
    fehlerZeilen.length > 0 &&
      fehlerZeilen.every(z => z.status === 'fehler') &&
      fehlerZeilen.some(z => z.id === String(KAPUTT)),
    fehlerZeilen.map(z => z.id).join(', ')
  );
  pruefe('… steht in der Adresse', /status=fehler/.test(pfad()), pfad());

  // --- Filter: Person -------------------------------------------------------------------------
  await seite.getByTestId('laeufe-filter-zuruecksetzen').click();
  await seite.waitForTimeout(500);
  pruefe(
    'Filter zurücksetzen leert die Adresse',
    pfad() === '/workspace/verwaltung/laeufe',
    pfad()
  );
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?von=${heute}`);
  await listeDa();
  await waehle('person', 'Ohne Person (Zeitplan, Ereignis)');
  const ohne = await zeilen();
  pruefe(
    'Filter „Ohne Person": Zeitplan, Ereignis und Hand ohne Person, kein Lauf mit Namen',
    ohne.length > 0 &&
      ohne.every(
        z => z.wer === 'ohne Person' || z.wer === 'Zeitplan' || /^Ereignis „[^“]*“$/.test(z.wer)
      ) &&
      ohne.some(z => z.id === String(EREIGNIS_B_OHNE)) &&
      ohne.some(z => z.id === String(HAND_OHNE)) &&
      (!ZEITPLAN || ohne.some(z => z.id === String(ZEITPLAN))) &&
      !ohne.some(z => z.id === String(HAND_A)),
    ohne
      .map(z => `${z.id}:${z.wer}`)
      .slice(0, 5)
      .join(' | ')
  );
  pruefe('… steht in der Adresse', /person=ohne/.test(pfad()), pfad());
  await bildGanz('laeufe-gefiltert-ohne-person.png');

  // Eine Person mit Namen: sie steht in der Auswahl, ihre Läufe und nur ihre.
  await seite.getByTestId('laeufe-filter-person').click();
  const optionen = await seite.getByRole('option').allInnerTexts();
  pruefe(
    'Die Auswahl der Personen nennt die Menschen des Geräts',
    optionen.length >= 3 && optionen.some(o => o.includes('Ohne Person')),
    `${optionen.length} Einträge`
  );
  await seite.keyboard.press('Escape');
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?app=${APP_A}&person=${ID_A}&von=${heute}`);
  await listeDa();
  const vonA = await zeilen();
  pruefe(
    'Filter Person (aus der Adresse): nur Läufe dieser Person, alle drei von a',
    vonA.length > 0 &&
      vonA.every(
        z => z.wer !== 'ohne Person' && z.wer !== 'Zeitplan' && !/^Ereignis „[^“]*“$/.test(z.wer)
      ) &&
      [HAND_A, KAPUTT, EREIGNIS_A].every(n => vonA.some(z => z.id === String(n))),
    vonA.map(z => z.id).join(', ')
  );

  // --- Filter: Zeitraum -------------------------------------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/laeufe`);
  await listeDa();
  await seite.getByTestId('laeufe-filter-von').fill(heute);
  await seite.waitForTimeout(700);
  const seitHeute = await zeilen();
  pruefe(
    'Filter Zeitraum „von heute": die Läufe der Abnahme stehen da, in der Adresse',
    NUMMERN.filter(n => n !== EINGEFUEGT).every(n => seitHeute.some(z => z.id === n)) &&
      pfad().includes(`von=${heute}`),
    pfad()
  );
  await seite.getByTestId('laeufe-filter-von').fill('2099-01-01');
  await seite.waitForTimeout(700);
  const zukunft = await zeilen();
  pruefe(
    'Ein Zeitraum in der Zukunft ist leer und sagt, was zu tun ist',
    zukunft.length === 0 && (await seite.getByText('Kein Lauf mit dieser Auswahl').count()) === 1
  );
  await bildGanz('laeufe-leer.png', 900);

  // --- Adresse hält die Auswahl, frisch geladen -------------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?app=${APP_B}&status=fertig&von=${heute}`);
  await listeDa();
  const frisch = await zeilen();
  const wertApp = (await seite.getByTestId('laeufe-filter-app').innerText()).trim();
  pruefe(
    'Frisch geladen steht die Auswahl aus der Adresse da: App b, nur fertige Läufe von b',
    frisch.length >= 2 &&
      frisch.every(z => z.status === 'fertig' && z.app.includes(`(${APP_B.split('-').pop()})`)) &&
      wertApp.includes(`(${APP_B.split('-').pop()})`),
    `${frisch.length} Zeilen, App »${wertApp}«`
  );
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?boese=1&app=${APP_A}&von=<script>`);
  await listeDa();
  pruefe(
    'Unbekannte Filter und ein Datum, das keines ist, werden aus der Adresse genommen',
    pfad() === `/workspace/verwaltung/laeufe?app=${APP_A}`,
    pfad()
  );

  // --- 4. Aufklappen, mehrfach, bis Ein- und Ausgabe ---------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?app=${APP_A}&von=${heute}`);
  await listeDa();
  await seite.getByTestId(`lauf-aufklappen-${KAPUTT}`).click();
  await seite.getByTestId(`lauf-aufklappen-${HAND_A}`).click();
  await seite.getByTestId(`lauf-detail-${KAPUTT}`).waitFor({ timeout: 30000 });
  await seite.getByTestId(`lauf-detail-${HAND_A}`).waitFor({ timeout: 30000 });
  const offen = await seite
    .locator('[data-testid^="lauf-aufklappen-"][aria-expanded="true"]')
    .count();
  pruefe('Zwei Läufe stehen zugleich aufgeklappt da', offen === 2, `${offen} offen`);
  // Seit #927 steht vorn ein Satz für Menschen und der Grund selbst unter
  // „Technische Angabe", zugeklappt. Ein Klick, dann muss er dastehen.
  const grundKasten = seite.getByTestId('lauf-grund').first();
  await grundKasten.locator('summary').click();
  const fehlerGrund = await grundKasten.innerText();
  pruefe(
    'Der Fehler nennt seinen Grund (unter „Technische Angabe")',
    /Route abgewiesen/.test(fehlerGrund),
    fehlerGrund.slice(0, 90)
  );
  // Ein Schritt klappt bis zu Ein- und Ausgabe auf: erst zu, dann auf.
  const schritt = seite
    .getByTestId(`lauf-detail-${KAPUTT}`)
    .locator('[data-testid^="schritt-"]')
    .first();
  await schritt.locator('button').first().waitFor({ timeout: 30000 });
  const vorKlick = await schritt.locator('pre').count();
  await schritt.locator('button').first().click();
  await seite.waitForTimeout(300);
  const nachKlick = await schritt.locator('pre').count();
  pruefe(
    'Ein Schritt klappt auf und zeigt Eingabe und Ausgabe',
    nachKlick > vorKlick || vorKlick >= 1,
    `${vorKlick} → ${nachKlick} Felder`
  );
  const detailText = await seite.getByTestId(`lauf-detail-${KAPUTT}`).innerText();
  pruefe(
    'Der aufgeklappte Lauf nennt Auslöser, Person, Zeiten und Schritte',
    /Auslöser/.test(detailText) &&
      /Von Hand/.test(detailText) &&
      /Person/.test(detailText) &&
      /Gestartet/.test(detailText) &&
      /Schritte und Gedankengang/.test(detailText),
    detailText.replace(/\s+/g, ' ').slice(0, 100)
  );
  const handText = await seite.getByTestId(`lauf-detail-${HAND_A}`).innerText();
  pruefe(
    'Der zweite Lauf zeigt das Ergebnis und den Gedankengang',
    /Ergebnis/.test(handText) && /Fertig\./.test(handText) && /Gedankengang/.test(handText),
    handText.replace(/\s+/g, ' ').slice(0, 100)
  );
  await bildGanz('laeufe-aufgeklappt.png', 2200);
  pruefe(
    'Ein fertiger Lauf hat keinen Knopf „Abbrechen"',
    (await seite.getByTestId(`lauf-abbrechen-${HAND_A}`).count()) === 0
  );

  // --- 5. Ein Link, ein Lauf -----------------------------------------------------------------------
  await seite.getByTestId(`lauf-link-${EREIGNIS_A}`).click();
  await seite.getByTestId('lauf-seite').waitFor({ timeout: 30000 });
  pruefe(
    'Der Link öffnet genau diesen Lauf unter seiner Adresse',
    pfad().startsWith(`/workspace/verwaltung/laeufe/${EREIGNIS_A}`),
    pfad()
  );
  const adresse = `${URL}/workspace/verwaltung/laeufe/${EREIGNIS_A}`;
  await seite.goto(adresse);
  await seite.getByTestId('lauf-seite').waitFor({ timeout: 30000 });
  await seite.getByTestId(`lauf-ausloeser-${EREIGNIS_A}`).waitFor({ timeout: 30000 });
  // Seit #927 traegt die Seite den Titel im Baustein `Kopf` (h1), nicht mehr als h3.
  const kopf = await seite
    .getByTestId('lauf-seite')
    .getByRole('heading', { level: 1 })
    .first()
    .innerText();
  const ausloeser = await seite.getByTestId(`lauf-ausloeser-${EREIGNIS_A}`).innerText();
  const person = await seite.getByTestId(`lauf-person-${EREIGNIS_A}`).innerText();
  pruefe(
    'Frisch geladen: derselbe Lauf, mit Auslöser Ereignis und seiner Person',
    kopf.includes(`Lauf ${EREIGNIS_A}`) &&
      /Ereignis „laeufe\.signal“/.test(ausloeser) &&
      person.trim().length > 0 &&
      person.trim() !== 'ohne Person',
    `${kopf} | ${ausloeser} | ${person}`
  );
  await bildGanz('lauf-seite-ereignis.png', 1300);
  await seite.goto(`${URL}/workspace/verwaltung/laeufe/${EREIGNIS_B_OHNE}`);
  await seite.getByTestId(`lauf-person-${EREIGNIS_B_OHNE}`).waitFor({ timeout: 30000 });
  pruefe(
    'Ein Ereignis ohne Person sagt „ohne Person"',
    (await seite.getByTestId(`lauf-person-${EREIGNIS_B_OHNE}`).innerText()).trim() === 'ohne Person'
  );
  if (ZEITPLAN) {
    await seite.goto(`${URL}/workspace/verwaltung/laeufe/${ZEITPLAN}`);
    await seite.getByTestId(`lauf-ausloeser-${ZEITPLAN}`).waitFor({ timeout: 30000 });
    pruefe(
      'Ein Lauf nach Zeitplan nennt den Auslöser Zeitplan',
      (await seite.getByTestId(`lauf-ausloeser-${ZEITPLAN}`).innerText()).trim() === 'Zeitplan'
    );
    await bildGanz('lauf-seite-zeitplan.png', 1300);
  }
  await seite.goto(`${URL}/workspace/verwaltung/laeufe/${KAPUTT}?app=${APP_A}`);
  await seite.getByTestId('lauf-grund').waitFor({ timeout: 30000 });
  await bildGanz('lauf-seite-fehler.png', 1300);
  await seite.getByTestId('lauf-zurueck').click();
  await listeDa();
  pruefe(
    '„Zurück zu den Läufen" führt zur Liste mit derselben Auswahl',
    pfad() === `/workspace/verwaltung/laeufe?app=${APP_A}`,
    pfad()
  );
  await seite.goto(`${URL}/workspace/verwaltung/laeufe/999999999`);
  await seite.getByTestId('lauf-fehler').waitFor({ timeout: 30000 });
  pruefe(
    'Ein Lauf, den es nicht gibt, sagt es',
    /gibt es nicht/.test(await seite.getByTestId('lauf-fehler').innerText())
  );

  // --- 6. Die Seite der App: ein Weg, keine zweite Liste ----------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/apps/${APP_A}`);
  await seite.getByTestId('laeufe-ansehen').waitFor({ timeout: 30000 });
  pruefe(
    'Die Seite der App zeigt keine zweite Läufe-Liste',
    (await seite.getByTestId('lauf-liste').count()) === 0 &&
      (await seite.getByTestId('laeufe-schalter').count()) === 0
  );
  await bildGanz('app-seite-laeufe.png', 2600);
  await seite.getByTestId('laeufe-ansehen').click();
  await listeDa();
  const ueberApp = await zeilen();
  pruefe(
    '„Läufe ansehen" führt in die Läufe mit dieser App als Filter',
    pfad().includes(`app=${APP_A}`) &&
      ueberApp.length > 0 &&
      ueberApp.every(z => z.app.startsWith('Probe: Läufe (a)')),
    pfad()
  );

  // --- 7. Schmal --------------------------------------------------------------------------------------
  await seite.setViewportSize({ width: 390, height: 844 });
  await seite.goto(`${URL}/workspace/verwaltung/laeufe?app=${APP_A}&von=${heute}`);
  await listeDa();
  await seite.getByTestId(`lauf-aufklappen-${KAPUTT}`).click();
  await seite.getByTestId(`lauf-detail-${KAPUTT}`).waitFor({ timeout: 30000 });
  const breite = await seite.evaluate(() => document.documentElement.scrollWidth);
  pruefe('Bei 390 px läuft nichts über den Rand', breite <= 392, `${breite} px`);
  await bildGanz('laeufe-schmal.png', 2000);
  await seite.setViewportSize({ width: 1440, height: 900 });
} finally {
  await browser.close();
}

console.log(rot === 0 ? '\nalles gruen' : `\n${rot} ROT`);
process.exit(rot === 0 ? 0 : 1);
