/**
 * Der Browser-Teil der Abnahme „eine Seite je App" (M5, 04.10.2026). Gerufen
 * von `app-seite-abnahme.sh`, das die Probe-App vorher hergestellt hat: Live
 * 1.0.0, Test 1.1.0 mit Änderungstext, A als Testperson, B mit Livezugang,
 * Verbindungen gemessen (eine genutzt, eine fremd abgewiesen, eine Störung).
 *
 *   seite        Als Admin: die Seite der App unter ihrer Adresse, Blöcke in
 *                der Reihenfolge des Auftrags, kein Bereich „Verbindungen"
 *                mehr (die alte Adresse landet bei den Apps), Technik nur
 *                aufgeklappt, rot nur die Störung. Am Ende schaltet sie den
 *                Flow mit „aktiv" AUS (das Skript misst danach am Backend).
 *   einschalten  Als Admin: den Flow wieder ein.
 *   testperson   Als A: „(Test) Name" in der Aktivitätsleiste, ein Klick
 *                landet in der Testfassung. Als B: nur die Livefassung.
 *
 * Passwörter kommen nur aus der Umgebung, nie aus einer Datei. Bilder unter
 * docs/plans/audits/<tag>-app-seite/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const B = process.env.ARASUL_B || '';
const B_PASS = process.env.ARASUL_B_PASSWORT || '';
const APP = process.env.ARASUL_SEITE_APP || '';
const NAME = process.env.ARASUL_SEITE_NAME || '';
const FLOW = process.env.ARASUL_SEITE_FLOW || '';
const TEXT = process.env.ARASUL_SEITE_TEXT || '';
// Der Tag in Ortszeit: kurz nach Mitternacht gäbe `toISOString` den Vortag (UTC).
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-app-seite`);
const PHASE = process.argv[2] || '';

const BLOECKE = [
  'Zustand',
  'Fassungen',
  'Personen',
  'Freigabestufen',
  'Flows',
  'Verbindungen',
  'Läufe',
  'KI-Aufrufe',
  'Protokoll',
];

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !A || !A_PASS || !B || !B_PASS || !APP || !NAME || !FLOW) {
  console.log('ROT    Konten, Passwörter oder ARASUL_SEITE_* fehlen -- der Aufrufer setzt sie.');
  process.exit(1);
}
if ([ADMIN, A, B].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
  process.exit(1);
}
if (!['seite', 'einschalten', 'testperson'].includes(PHASE)) {
  console.log('ROT    Phase: seite, einschalten oder testperson.');
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});

async function sitzung(benutzer, passwort) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const r = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  if (r.status() !== 200) {
    pruefe(`${benutzer} meldet sich im Browser an`, false, `HTTP ${r.status()}`);
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  seitenfehler (${benutzer}): ${e.message}`));
  return { ctx, page };
}

const bild = (page, name, ganz = true) =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: ganz });

async function sichtbar(locator, ms = 20000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}
const text = locator =>
  locator
    .first()
    .innerText()
    .catch(() => '');

/** Die Seite der App unter ihrer Adresse, bis der Zustand steht. */
async function appSeite(page) {
  await page.goto(`${URL}/workspace/verwaltung/apps/${APP}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await sichtbar(page.getByTestId(`app-ansicht-${APP}`), 30000);
  await sichtbar(page.getByTestId('app-zustand-satz'));
  // Personen, Flows und Verbindungen kommen aus eigenen Abfragen.
  await sichtbar(page.getByTestId(`flow-${FLOW}`));
  await sichtbar(page.getByTestId('verbindung-example.org'));
  await page.waitForTimeout(800);
}

async function seite() {
  const { ctx, page } = await sitzung(ADMIN, ADMIN_PASS);
  try {
    // Die Liste: ein Satz, höchstens ein Tag.
    await page.goto(`${URL}/workspace/verwaltung/apps`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const zeile = page.getByTestId(`app-oeffnen-${APP}`);
    pruefe('Die App steht in der Liste der Verwaltung', await sichtbar(zeile, 30000));
    const zeilenText = await text(zeile);
    pruefe(
      'Die Zeile trägt höchstens ein Tag, „(Test)"',
      zeilenText.includes('(Test)') && !/Bibliothek|live 1|test 1/.test(zeilenText),
      zeilenText.replace(/\s+/g, ' ')
    );
    await bild(page, 'liste', false);

    // Kein eigener Bereich Verbindungen mehr, in der Leiste der Verwaltung.
    const bereiche = await text(page.getByTestId('verwaltung-bereiche'));
    pruefe(
      'Die Verwaltung hat keinen Bereich „Verbindungen" mehr',
      bereiche.includes('Apps') && !bereiche.includes('Verbindungen'),
      bereiche.replace(/\s+/g, ' ')
    );
    await page.goto(`${URL}/workspace/verwaltung/verbindungen`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    pruefe(
      'Die alte Adresse der Verbindungen landet bei den Apps',
      await sichtbar(page.getByTestId('app-liste'), 30000)
    );

    // Ein Klick öffnet die Seite, und sie hat eine Adresse.
    await page.getByTestId(`app-oeffnen-${APP}`).click();
    await sichtbar(page.getByTestId(`app-ansicht-${APP}`));
    pruefe(
      'Die Seite der App hat ihre Adresse',
      page.url().endsWith(`/workspace/verwaltung/apps/${APP}`),
      page.url()
    );

    await appSeite(page);
    const titel = await page
      .getByTestId(`app-ansicht-${APP}`)
      .locator('h2')
      .allInnerTexts()
      .then(t => t.map(x => x.trim()));
    pruefe(
      'Die Blöcke stehen in der Reihenfolge des Auftrags',
      JSON.stringify(titel) === JSON.stringify(BLOECKE),
      titel.join(', ')
    );
    const satz = await text(page.getByTestId('app-zustand-satz'));
    pruefe(
      'Zustand in einem Satz: live 1.0.0, im Test wartet 1.1.0',
      satz.includes('Läuft mit Fassung 1.0.0') && satz.includes('Im Test wartet Fassung 1.1.0'),
      satz
    );
    const zahlen = await text(page.getByTestId('app-zustand-zahlen'));
    pruefe(
      'Zustand nennt Personen mit Zugang, Testperson und aktive Flows',
      /3 Personen mit Zugang, davon 1 Testperson/.test(zahlen) && /1 von 1 Flow aktiv/.test(zahlen),
      zahlen
    );
    const stoerung = await text(page.getByTestId('app-zustand-stoerung'));
    pruefe(
      'Rot im Zustand nur die echte Störung: die eingetragene Verbindung, die abgewiesen wird',
      /Localtest wird abgewiesen/.test(stoerung) &&
        (await page.getByTestId('app-zustand-stoerung').count()) === 1,
      stoerung
    );
    pruefe(
      'Fassungen: der Änderungstext steht an der Testfassung',
      (await text(page.getByTestId('aenderungstext-test'))).includes(TEXT)
    );
    pruefe(
      'Fassungen: Technik ist zugeklappt',
      (await page.getByTestId('stand-live-technik').getByText('Eingespielt').count()) === 0 &&
        (await page.getByTestId('stand-test-technik').getByText('Eingespielt').count()) === 0
    );
    pruefe(
      'Fassungen: „Live schalten" und „Zurück" stehen da, wo sie etwas tun',
      (await sichtbar(page.getByTestId('schalten-live'), 5000)) &&
        (await page.getByTestId('schalten-zurueck').count()) === 0
    );
    await bild(page, 'ganz');

    // Personen: A ist Testperson, B nicht.
    const testA = page.getByTestId(`person-test-${APP}-${A}`);
    const testB = page.getByTestId(`person-test-${APP}-${B}`);
    pruefe(
      `Personen: ${A} ist Testperson, ${B} hat Zugang ohne Test`,
      (await testA.getAttribute('aria-checked')) === 'true' &&
        (await testB.getAttribute('aria-checked')) === 'false' &&
        (await page.getByTestId(`person-zugang-${APP}-${B}`).getAttribute('aria-checked')) ===
          'true'
    );
    await page.getByTestId('personen-liste').scrollIntoViewIfNeeded();
    await bild(page, 'personen', false);

    // Flows: Satz zum Ablauf, Schritte aufgeklappt.
    const ablauf = await text(page.getByTestId(`flow-ablauf-${FLOW}`));
    pruefe(
      'Flows: wann er startet und wie viele Schritte, in einem Satz',
      ablauf.includes('Startet von Hand in der App') && ablauf.includes('2 Schritte'),
      ablauf
    );
    pruefe(
      'Flows: Schritte sind zugeklappt',
      (await page.getByTestId(`flow-schritte-${FLOW}`).count()) === 0
    );
    await page.getByTestId(`flow-mehr-${FLOW}-knopf`).click();
    const schritte = await text(page.getByTestId(`flow-schritte-${FLOW}`));
    pruefe(
      'Flows: aufgeklappt stehen die Schritte und die Stufen',
      /1\. pruefen/.test(schritte) &&
        /2\. zeichnen/.test(schritte) &&
        (await text(page.getByTestId(`flow-mehr-${FLOW}`))).includes('Prüfung, dann Leitung'),
      schritte.replace(/\s+/g, ' ')
    );
    await page.getByTestId(`flow-${FLOW}`).scrollIntoViewIfNeeded();
    await bild(page, 'flows', false);

    // Verbindungen: lesbar, Adressen zu, rot nur die Störung.
    const example = page.getByTestId('verbindung-example.org');
    const exampleText = await text(example);
    pruefe(
      'Verbindungen: lesbar benannt, mit Nutzung, Adresse zugeklappt',
      exampleText.includes('Example') &&
        /2× genutzt/.test(exampleText) &&
        !exampleText.includes('example.org'),
      exampleText.replace(/\s+/g, ' ')
    );
    pruefe(
      'Verbindungen: rot ist genau eine, die Störung',
      (await page.locator('[data-stoerung="true"]').count()) === 1 &&
        (await page.getByTestId('verbindung-localtest.me').getAttribute('data-stoerung')) === 'true'
    );
    pruefe(
      'Verbindungen: Abgewiesenes ohne Eintrag ist grau und zugeklappt',
      (await page.getByTestId('abgewiesen-example.com').count()) === 0 &&
        /Abgewiesen: 1 Adresse/.test(await text(page.getByTestId('verbindungen-abgewiesen-knopf')))
    );
    await page.getByTestId('verbindung-mehr-example.org-knopf').click();
    await page.getByTestId('verbindungen-abgewiesen-knopf').click();
    pruefe(
      'Aufgeklappt: die Adresse und die abgewiesene fremde Adresse',
      (await text(page.getByTestId('verbindung-mehr-example.org'))).includes('example.org') &&
        (await text(page.getByTestId('abgewiesen-example.com'))).includes('3×')
    );
    await page.getByTestId('verbindungen-liste').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await bild(page, 'verbindungen', false);

    // Dunkel: dieselbe Seite folgt dem Theme.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await bild(page, 'dunkel');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    // Zuletzt: den Flow im Browser ausschalten.
    const schalter = page.getByTestId(`flow-aktiv-${FLOW}`);
    await schalter.click();
    await page.waitForFunction(
      flow =>
        document.querySelector(`[data-testid="flow-${flow}"]`)?.getAttribute('data-aktiv') ===
        'false',
      FLOW,
      { timeout: 20000 }
    );
    pruefe(
      'Im Browser ausgeschaltet: die Zeile sagt „aus, startet nicht"',
      (await text(page.getByTestId(`flow-aus-${FLOW}`))).includes('aus, startet nicht')
    );
    await page.getByTestId(`flow-${FLOW}`).scrollIntoViewIfNeeded();
    await bild(page, 'flow-aus', false);
  } finally {
    await ctx.close();
  }
}

async function einschalten() {
  const { ctx, page } = await sitzung(ADMIN, ADMIN_PASS);
  try {
    await appSeite(page);
    pruefe(
      'Nach dem Neuladen steht der Flow weiter auf aus',
      (await page.getByTestId(`flow-${FLOW}`).getAttribute('data-aktiv')) === 'false'
    );
    await page.getByTestId(`flow-aktiv-${FLOW}`).click();
    await page.waitForFunction(
      flow =>
        document.querySelector(`[data-testid="flow-${flow}"]`)?.getAttribute('data-aktiv') ===
        'true',
      FLOW,
      { timeout: 20000 }
    );
    pruefe('Im Browser wieder eingeschaltet', true);
  } finally {
    await ctx.close();
  }
}

async function testperson() {
  const a = await sitzung(A, A_PASS);
  try {
    await a.page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const test = a.page.getByTestId(`leiste-app-${APP}-test`);
    pruefe(`${A} sieht die Testfassung in der Leiste`, await sichtbar(test, 30000));
    pruefe(
      `… benannt „(Test) ${NAME}"`,
      (await test.getAttribute('aria-label')) === `(Test) ${NAME}`,
      await test.getAttribute('aria-label')
    );
    pruefe(
      '… und daneben die Livefassung mit dem Namen allein',
      (await a.page.getByTestId(`leiste-app-${APP}-live`).getAttribute('aria-label')) === NAME
    );
    await test.hover();
    await a.page.waitForTimeout(500);
    await bild(a.page, 'leiste', false);
    await test.click();
    const rahmen = a.page.locator('iframe');
    await sichtbar(rahmen, 30000);
    const quelle = (await rahmen.first().getAttribute('src')) || '';
    pruefe(
      'Ein Klick landet in der Testfassung',
      quelle.includes(`/apps/${APP}/test/`) && a.page.url().endsWith(`/app/${APP}/test`),
      `${quelle} | ${a.page.url()}`
    );
    await a.page.waitForTimeout(1500);
    await bild(a.page, 'in-test', false);
  } finally {
    await a.ctx.close();
  }

  const b = await sitzung(B, B_PASS);
  try {
    await b.page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    pruefe(
      `${B} sieht nur die Livefassung`,
      (await sichtbar(b.page.getByTestId(`leiste-app-${APP}-live`), 30000)) &&
        (await b.page.getByTestId(`leiste-app-${APP}-test`).count()) === 0
    );
  } finally {
    await b.ctx.close();
  }
}

try {
  if (PHASE === 'seite') await seite();
  if (PHASE === 'einschalten') await einschalten();
  if (PHASE === 'testperson') await testperson();
} catch (fehler) {
  pruefe(`Der Browser-Teil (${PHASE}) lief durch`, false, fehler.message);
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
