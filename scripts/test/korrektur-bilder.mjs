/**
 * Der Browser-Teil der Abnahme „Korrekturfelder" (M5, 04.10.2026). Gerufen von
 * `korrektur-abnahme.sh` mit dem Zustand, den das Skript gerade hergestellt hat:
 *
 *   vorher    B sieht unter „Für Sie" die Freigabe aus der Erkennung mit „Prüfen",
 *             öffnet sie: Original links, Felder rechts, datum mit „prüfen" oben
 *             und als Eingabefeld, betrag nur zum Lesen, keine Prozentzahl.
 *             Dieselbe Freigabe in der App, mit dem Muster von /marken/5/.
 *   leitung   Der Admin öffnet die Freigabe der Stufe Leitung: oben der Satz, was
 *             bisher geschah, die frühere Stufe klappt auf mit der Änderung.
 *   lauf      Die Läufe-Ansicht der Verwaltung: Vorschlag und Änderung je Feld.
 *   baustein  B korrigiert in der App (Muster von /marken/5/) datum, bestätigt,
 *             und danach steht wieder die Liste da.
 *
 * Passwoerter nur aus der Umgebung. Bilder unter
 * docs/plans/audits/<tag>-freigabe-korrekturfelder/.
 *
 *   node scripts/test/korrektur-bilder.mjs <phase>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const B = process.env.ARASUL_B || '';
const B_PASS = process.env.ARASUL_B_PASSWORT || '';
const APP = process.env.ARASUL_KORREKTUR_APP || '';
const LAUF = process.env.ARASUL_LAUF || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-freigabe-korrekturfelder`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !B || !B_PASS || !APP) {
  console.log('ROT    Konten, Passwoerter oder ARASUL_KORREKTUR_APP fehlen, der Aufrufer setzt sie.');
  process.exit(1);
}
if ([ADMIN, B].includes('admin')) {
  console.log('ROT    Nie das Konto admin.');
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

const bild = (page, name) =>
  page.screenshot({ path: path.join(ZIEL, `${PHASE}-${name}.png`), fullPage: true });

async function sichtbar(locator, ms = 20000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

async function startseite(page) {
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sichtbar(page.getByTestId('offene-freigaben'));
  await page.waitForTimeout(800);
}

/** Die Karte mit diesem Titel (das Muster setzt `aria-label` = Titel). */
const karte = (page, titel) => page.locator(`article[aria-label="${titel}"]`);

/** Hat das Bild im Original geladen? (Breite > 0 nach dem Laden) */
async function originalGeladen(page) {
  const img = page.locator('[data-testid$="-original"] img');
  if (!(await sichtbar(img, 15000))) return false;
  return img.first().evaluate(el => el.complete && el.naturalWidth > 0);
}

/** Die Einzelansicht einer Freigabe mit Feldern prüfen. */
async function einzelansicht(page, wo) {
  const einzeln = page.getByTestId('freigabe-einzeln');
  pruefe(`${wo}: Einzelansicht offen`, await sichtbar(einzeln, 10000));
  const reihen = await page
    .locator('[data-testid$="-felder"] [data-pruefen]')
    .evaluateAll(els => els.map(el => [el.getAttribute('data-testid'), el.dataset.pruefen]));
  pruefe(
    `${wo}: zu Prüfendes steht oben`,
    reihen.length > 0 && reihen[0][1] === 'ja',
    reihen.map(r => `${r[0].split('-feld-')[1]}=${r[1]}`).join(', ')
  );
  pruefe(
    `${wo}: datum trägt „prüfen" und ist ein Eingabefeld`,
    (await page.locator('[data-testid$="-feld-datum-pruefen"]').count()) === 1 &&
      (await page.locator('[data-testid$="-feld-datum-eingabe"]').count()) === 1
  );
  pruefe(
    `${wo}: betrag nur zum Lesen`,
    (await page.locator('[data-testid$="-feld-betrag-eingabe"]').count()) === 0 &&
      (await page.locator('[data-testid$="-feld-betrag-wert"]').count()) === 1
  );
  const text = await einzeln.innerText().catch(() => '');
  pruefe(`${wo}: keine Prozentzahl`, !/\d\s*%/.test(text));
  pruefe(`${wo}: Original links geladen`, await originalGeladen(page));
  const links = await page
    .locator('[data-testid$="-original"]')
    .first()
    .boundingBox()
    .catch(() => null);
  const rechts = await page
    .locator('[data-testid$="-felder"]')
    .first()
    .boundingBox()
    .catch(() => null);
  pruefe(
    `${wo}: Original links, Felder rechts`,
    Boolean(links && rechts && links.x < rechts.x),
    links && rechts ? `x ${Math.round(links.x)} < ${Math.round(rechts.x)}` : 'kein Mass'
  );
  // Zoombar: die Dokumentanzeige trägt Knöpfe zum Vergrößern.
  pruefe(
    `${wo}: Original zoombar`,
    (await page.locator('[data-testid$="-original"] button').count()) > 0
  );
}

if (PHASE === 'vorher') {
  const titel = 'Erkennung unsicher: Feld datum';
  const b = await sitzung(B, B_PASS);
  await startseite(b.page);
  const k = karte(b.page, titel);
  pruefe(`${B} sieht „${titel}" unter „Für Sie"`, await sichtbar(k, 15000));
  pruefe(
    'In der Liste: „Prüfen" statt „Bestätigen"',
    (await k.locator('[data-testid$="-pruefen"]').count()) === 1 &&
      (await k.locator('[data-testid$="-bestaetigen"]').count()) === 0
  );
  await bild(b.page, `${B}-fuer-sie`);
  await k.locator('[data-testid$="-pruefen"]').click();
  await b.page.waitForTimeout(1500);
  await einzelansicht(b.page, 'Arasul');
  await bild(b.page, `${B}-einzeln`);

  // Dieselbe Freigabe in der App: das Muster vom Gerät unter /marken/5/.
  await b.page.goto(`${URL}/apps/${APP}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const k2 = karte(b.page, titel);
  pruefe('In der App (Muster von /marken/5/) dieselbe Freigabe', await sichtbar(k2, 20000));
  const fassung = await b.page.locator('h1 + *').first().innerText().catch(() => '');
  pruefe('Die App zeigt Bibliothek 5.4', /Bibliothek 5\.4/.test(await b.page.content()), fassung);
  await bild(b.page, `${B}-app-liste`);
  await k2.locator('[data-testid$="-pruefen"]').click();
  await b.page.waitForTimeout(1500);
  await einzelansicht(b.page, 'App');
  await bild(b.page, `${B}-app-einzeln`);
  await b.ctx.close();
} else if (PHASE === 'leitung') {
  const titel = 'Beleg 4711 zeichnen';
  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await startseite(ad.page);
  const k = karte(ad.page, titel);
  pruefe(`${ADMIN} sieht „${titel}"`, await sichtbar(k, 15000));
  await k.locator('[data-testid$="-oeffnen"]').click();
  const satz = ad.page.locator('[data-testid$="-geschichte"]');
  pruefe('Oben ein Satz, was bisher geschah', await sichtbar(satz, 10000));
  const text = (await satz.innerText().catch(() => '')).trim();
  pruefe(
    'Er nennt die Prüfung, wer bestätigt hat und die Änderung',
    text.includes(`Prüfung bestätigt von ${B}, 1 Feld geändert`),
    text
  );
  await ad.page.locator('[data-testid$="-bisher-schalter"]').click();
  const korrektur = ad.page.getByTestId('freigabe-korrekturen');
  pruefe('Die frühere Stufe klappt auf mit Vorschlag und Änderung', await sichtbar(korrektur, 5000));
  pruefe(
    'datum: leer → 01.10.2026',
    /datum: leer → 01\.10\.2026/.test(await korrektur.innerText().catch(() => ''))
  );
  await bild(ad.page, 'einzeln');
  await ad.ctx.close();
} else if (PHASE === 'lauf') {
  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await ad.page.goto(`${URL}/workspace/verwaltung/apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const knopf = ad.page.getByTestId(`app-oeffnen-${APP}`);
  if (await sichtbar(knopf)) await knopf.click();
  const lauf = ad.page.getByTestId(`lauf-oeffnen-${LAUF}`);
  pruefe(`Die Läufe der App nennen Lauf ${LAUF}`, await sichtbar(lauf));
  await lauf.click();
  const felder = ad.page.getByTestId('lauf-freigabe-felder');
  pruefe('Die Läufe-Ansicht zeigt erkannte Felder und Änderungen', await sichtbar(felder));
  const zeile = ad.page.locator('[data-testid^="lauf-feld-"][data-testid$="-datum-neu"]');
  const neu = (await zeile.innerText().catch(() => '')).replace(/\s+/g, ' ');
  pruefe('datum: geändert zu 01.10.2026, mit wer', neu.includes('01.10.2026') && neu.includes(B), neu);
  await felder.scrollIntoViewIfNeeded();
  await bild(ad.page, 'laeufe-ansicht');
  await ad.ctx.close();
} else if (PHASE === 'baustein') {
  const titel = 'Erkennung unsicher: Felder datum, betrag';
  const b = await sitzung(B, B_PASS);
  await b.page.goto(`${URL}/apps/${APP}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const k = karte(b.page, titel);
  pruefe(`In der App: „${titel}"`, await sichtbar(k, 20000));
  await k.locator('[data-testid$="-pruefen"]').click();
  await b.page.waitForTimeout(1500);
  pruefe(
    'datum und betrag tragen „prüfen"',
    (await b.page.locator('[data-testid$="-feld-datum-pruefen"]').count()) === 1 &&
      (await b.page.locator('[data-testid$="-feld-betrag-pruefen"]').count()) === 1
  );
  pruefe('Original geladen', await originalGeladen(b.page));
  await b.page.locator('[data-testid$="-feld-datum-eingabe"]').fill('03.10.2026');
  pruefe(
    'Unter dem Feld steht der Vorschlag der KI',
    await sichtbar(b.page.getByText('Vorschlag der KI: leer'), 5000)
  );
  await bild(b.page, 'korrigiert');
  await b.page.locator('[data-testid="freigabe-einzeln"] [data-testid$="-bestaetigen"]').click();
  const liste = b.page.getByTestId('freigabe-liste');
  pruefe('Nach der Entscheidung wieder die Liste', await sichtbar(liste, 15000));
  pruefe(
    'Die entschiedene Freigabe ist weg',
    (await b.page.getByTestId('freigabe-einzeln').count()) === 0 &&
      (await karte(b.page, titel).count()) === 0
  );
  await b.page.waitForTimeout(800);
  await bild(b.page, 'danach-liste');
  await b.ctx.close();
} else {
  console.log(`ROT    Phase "${PHASE}" gibt es nicht (vorher, leitung, lauf, baustein).`);
  process.exit(1);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `Bilder (${PHASE}): ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, unter ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
