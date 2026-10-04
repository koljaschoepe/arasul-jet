/**
 * Der Browser-Teil der Abnahme „Rückfall im Gerät" (M5, 04.10.2026). Gerufen
 * von `rueckfall-abnahme.sh` mit dem Zustand, den das Skript gerade hergestellt
 * hat:
 *
 *   fuer-sie  A sieht unter „Für Sie" die Freigabe der App ohne eigene Ansicht,
 *             klickt, und sie geht in ARASUL auf (nicht die App): Original links,
 *             Felder rechts, datum mit „prüfen" oben und als Eingabefeld, betrag
 *             nur zum Lesen. A ändert datum, bestätigt, und danach steht wieder
 *             die Liste da; die Freigabe ist weg.
 *   tieflink  Bei der App, die `zeigt_freigaben` erklärt, öffnet derselbe Klick
 *             die App mit ?freigabe=<nummer> im Rahmen; nichts geht in Arasul auf.
 *
 * Es wird nur mit A gearbeitet; Passwörter nur aus der Umgebung. Bilder unter
 * docs/plans/audits/<tag>-freigabe-rueckfall/.
 *
 *   node scripts/test/rueckfall-bilder.mjs <phase>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const APP = process.env.ARASUL_RUECKFALL_APP || '';
const TIEF = process.env.ARASUL_TIEFLINK_APP || '';
const ANFRAGE = process.env.ARASUL_ANFRAGE || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-freigabe-rueckfall`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!A || !A_PASS || !APP || !TIEF || !ANFRAGE) {
  console.log('ROT    Konto, Passwort, Apps oder ARASUL_ANFRAGE fehlen, der Aufrufer setzt sie.');
  process.exit(1);
}
if (A === 'admin') {
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

/** Hat das Bild im Original geladen? (Breite > 0 nach dem Laden) */
async function originalGeladen(page) {
  const img = page.locator('[data-testid$="-original"] img');
  if (!(await sichtbar(img, 15000))) return false;
  return img.first().evaluate(el => el.complete && el.naturalWidth > 0);
}

if (PHASE === 'fuer-sie') {
  const a = await sitzung(A, A_PASS);
  await startseite(a.page);
  const zeile = a.page.getByTestId(`freigabe-${ANFRAGE}`);
  pruefe(`${A} sieht die Freigabe ${ANFRAGE} unter „Für Sie"`, await sichtbar(zeile, 15000));
  pruefe(
    'Die Zeile nennt die App',
    ((await zeile.innerText().catch(() => '')) || '').includes('rueckfall'),
    (await zeile.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80)
  );
  await bild(a.page, 'liste');

  await a.page.getByTestId(`freigabe-${ANFRAGE}-oeffnen`).click();
  const imGeraet = a.page.getByTestId('freigabe-im-geraet');
  pruefe('Ein Klick öffnet die Freigabe in Arasul', await sichtbar(imGeraet, 10000));
  pruefe(
    'Es öffnet sich nicht die App (kein Rahmen, Adresse bleibt die Startseite)',
    (await a.page.locator('iframe').count()) === 0 && !a.page.url().includes('/workspace/app/'),
    a.page.url().replace(URL, '')
  );
  const einzeln = a.page.getByTestId('freigabe-einzeln');
  pruefe('Einzelansicht offen', await sichtbar(einzeln, 10000));
  const reihen = await a.page
    .locator('dl[data-testid$="-felder"] [data-pruefen]')
    .evaluateAll(els => els.map(el => [el.getAttribute('data-testid'), el.dataset.pruefen]));
  pruefe(
    'Zu Prüfendes steht oben',
    reihen.length > 0 && reihen[0][1] === 'ja',
    reihen.map(r => `${r[0].split('-feld-')[1]}=${r[1]}`).join(', ')
  );
  pruefe(
    'datum trägt „prüfen" und ist ein Eingabefeld',
    (await a.page.locator('[data-testid$="-feld-datum-pruefen"]').count()) === 1 &&
      (await a.page.locator('[data-testid$="-feld-datum-eingabe"]').count()) === 1
  );
  pruefe(
    'betrag nur zum Lesen',
    (await a.page.locator('[data-testid$="-feld-betrag-eingabe"]').count()) === 0 &&
      (await a.page.locator('[data-testid$="-feld-betrag-wert"]').count()) === 1
  );
  pruefe('Keine Prozentzahl', !/\d\s*%/.test(await einzeln.innerText().catch(() => '')));
  pruefe('Original geladen', await originalGeladen(a.page));
  const links = await a.page
    .locator('[data-testid$="-original"]')
    .first()
    .boundingBox()
    .catch(() => null);
  const rechts = await a.page
    .locator('dl[data-testid$="-felder"]')
    .first()
    .boundingBox()
    .catch(() => null);
  pruefe(
    'Original links, Felder rechts',
    Boolean(links && rechts && links.x < rechts.x),
    links && rechts ? `x ${Math.round(links.x)} < ${Math.round(rechts.x)}` : 'kein Mass'
  );
  pruefe(
    'Original zoombar',
    (await a.page.locator('[data-testid$="-original"] button').count()) > 0
  );
  pruefe(
    'Darunter steht, bei wem sie liegt, und Weitergeben',
    await sichtbar(a.page.getByTestId(`freigabe-${ANFRAGE}-zustaendig`), 5000)
  );
  await bild(a.page, 'einzeln');

  await a.page.locator('[data-testid$="-feld-datum-eingabe"]').fill('03.10.2026');
  pruefe(
    'Unter dem Feld steht der Vorschlag der KI',
    await sichtbar(a.page.getByText('Vorschlag der KI: leer'), 5000)
  );
  await bild(a.page, 'korrigiert');
  await a.page.locator('[data-testid="freigabe-einzeln"] [data-testid$="-bestaetigen"]').click();
  let liste = true;
  try {
    await a.page.getByTestId('freigabe-im-geraet').waitFor({ state: 'detached', timeout: 20000 });
  } catch {
    liste = false;
  }
  pruefe(
    'Nach der Entscheidung wieder die Liste (keine Einzelansicht mehr)',
    liste && (await sichtbar(a.page.getByTestId('offene-freigaben'), 15000))
  );
  let weg = true;
  try {
    await a.page.getByTestId(`freigabe-${ANFRAGE}`).waitFor({ state: 'detached', timeout: 20000 });
  } catch {
    weg = false;
  }
  pruefe('Die entschiedene Freigabe ist aus der Liste', weg);
  await a.page.waitForTimeout(800);
  await bild(a.page, 'danach-liste');
  await a.ctx.close();
} else if (PHASE === 'tieflink') {
  const a = await sitzung(A, A_PASS);
  await startseite(a.page);
  const zeile = a.page.getByTestId(`freigabe-${ANFRAGE}`);
  pruefe(
    `${A} sieht die Freigabe ${ANFRAGE} der App, die es erklärt`,
    await sichtbar(zeile, 15000)
  );
  await bild(a.page, 'liste');
  await a.page.getByTestId(`freigabe-${ANFRAGE}-oeffnen`).click();
  const rahmen = a.page.locator('iframe');
  pruefe('Ein Klick öffnet die App im Rahmen', await sichtbar(rahmen, 15000));
  const src =
    (await rahmen
      .first()
      .getAttribute('src')
      .catch(() => '')) || '';
  pruefe(
    'Der Rahmen lädt die App mit ?freigabe=<nummer> (Tieflink)',
    src.includes(`/apps/${TIEF}/`) && src.includes(`?freigabe=${ANFRAGE}`),
    src
  );
  pruefe(
    'Es geht nichts in Arasul auf',
    (await a.page.getByTestId('freigabe-im-geraet').count()) === 0
  );
  await a.page.waitForTimeout(1500);
  await bild(a.page, 'app');
  await a.ctx.close();
} else {
  console.log(`ROT    Phase "${PHASE}" gibt es nicht (fuer-sie, tieflink).`);
  process.exit(1);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `Bilder (${PHASE}): ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, unter ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
