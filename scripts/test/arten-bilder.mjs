/**
 * Der Browser-Teil der Abnahme „Arten" (M5, 04.10.2026). Gerufen von
 * `arten-abnahme.sh` mit dem Zustand, den das Skript gerade hergestellt hat:
 *
 *   bestaetigen  B sieht unter „Für Sie" die Freigabe „Ergebnis bestätigen: texte"
 *                mit dem Ergebnis.
 *   erkennung    B sieht „Erkennung unsicher: Feld datum", obwohl der Flow autonom ist.
 *   verwaltung   Die Seite der App in der Verwaltung: je Flow die Art als Auswahl,
 *                bei nur-autonom ohne Wahl.
 *
 * Passwoerter nur aus der Umgebung. Bilder unter
 * docs/plans/audits/<tag>-flow-arten/.
 *
 *   node scripts/test/arten-bilder.mjs <phase>
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
const APP = process.env.ARASUL_ARTEN_APP || '';
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-flow-arten`);
const PHASE = process.argv[2] || '';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!ADMIN || !ADMIN_PASS || !B || !B_PASS || !APP) {
  console.log('ROT    Konten, Passwoerter oder ARASUL_ARTEN_APP fehlen -- der Aufrufer setzt sie.');
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

async function karteFuerB(titel) {
  const b = await sitzung(B, B_PASS);
  await startseite(b.page);
  const li = b.page.getByTestId('fuer-sie').locator('[data-testid="freigabe-liste"] > li').filter({ hasText: titel });
  pruefe(`${B} sieht „${titel}" unter „Für Sie"`, await sichtbar(li, 15000));
  const text = (
    await li
      .first()
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  await bild(b.page, `${B}-startseite`);
  await b.ctx.close();
  return text;
}

if (PHASE === 'bestaetigen') {
  const text = await karteFuerB('Ergebnis bestätigen: texte');
  pruefe(
    'mit dem Ergebnis als Zusammenhang',
    text.length > 'Ergebnis bestätigen: texte'.length + 20,
    text.slice(0, 140)
  );
} else if (PHASE === 'erkennung') {
  const text = await karteFuerB('Erkennung unsicher: Feld datum');
  pruefe('Grund und Feld stehen auf der Karte', /Erkennung unsicher: Feld datum/.test(text));
} else if (PHASE === 'verwaltung') {
  const ad = await sitzung(ADMIN, ADMIN_PASS);
  await ad.page.goto(`${URL}/workspace/verwaltung/apps`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const knopf = ad.page.getByTestId(`app-oeffnen-${APP}`);
  if (await sichtbar(knopf)) await knopf.click();
  const liste = ad.page.getByTestId('flow-liste');
  pruefe('Die Seite der App zeigt die Flows', await sichtbar(liste));
  const texte = ad.page.getByTestId('flow-art-texte');
  pruefe('texte: Auswahl der Art', await sichtbar(texte, 10000));
  const vorher = (await texte.innerText().catch(() => '')).trim();
  await liste.scrollIntoViewIfNeeded();
  await bild(ad.page, 'flows-vorher');
  await texte.click();
  pruefe(
    'beide Arten stehen zur Wahl',
    (await sichtbar(ad.page.getByTestId('flow-art-texte-autonom'), 5000)) &&
      (await sichtbar(ad.page.getByTestId('flow-art-texte-ergebnis_bestaetigen'), 5000))
  );
  await bild(ad.page, 'auswahl');
  const ziel = vorher.includes('Autonom') ? 'ergebnis_bestaetigen' : 'autonom';
  await ad.page.getByTestId(`flow-art-texte-${ziel}`).click();
  await ad.page.waitForTimeout(1500);
  const nachher = (await texte.innerText().catch(() => '')).trim();
  pruefe('Die Wahl ist übernommen', nachher !== vorher, `${vorher} -> ${nachher}`);
  pruefe(
    'nur-autonom: keine Auswahl, nur die feste Art',
    (await ad.page.getByTestId('flow-art-nur-autonom').count()) === 0 &&
      (await ad.page.getByTestId('flow-art-fest-nur-autonom').innerText()).includes('Autonom')
  );
  await bild(ad.page, 'flows-nachher');
  await ad.ctx.close();
} else {
  console.log(`ROT    Phase "${PHASE}" gibt es nicht (bestaetigen, erkennung, verwaltung).`);
  process.exit(1);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `Bilder (${PHASE}): ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, unter ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
