/**
 * Der Bereich Modelle der Verwaltung im Browser, am Geraet (M5, Auftrag
 * verwaltung-modelle). Bilder und die Fragen, die ein Bild nicht beantwortet:
 *
 *   1. Eine Zeile Speicher fuer KI steht ueber der Liste, mit Zahlen.
 *   2. Je Modell eine Zeile mit Groesse, Faehigkeiten, warm und den Flows.
 *   3. Es gibt keinen Knopf zum Laden oder Entladen von Hand.
 *   4. Das Entfernen eines genutzten Modells (hier: des Standards) ist gesperrt,
 *      der Knopf ist aus und traegt den Grund.
 *   5. Ein zu grosses Modell wird beim Hinzufuegen abgewiesen, mit der Pruefung
 *      vorab, und es wird NICHTS geladen.
 *
 * Aufruf (Tunnel: ssh -f -N -L 8443:localhost:443 jetson):
 *   ARASUL_URL=https://localhost:8443 ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/verwaltung-modelle-bilder.mjs
 *
 * Playwright steht nicht im Lockfile (Regel 7); die Pakete aus einem anderen
 * Checkout als Symlink nach node_modules legen und danach wieder entfernen.
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
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
const ZU_GROSS = process.env.ARASUL_ZU_GROSSES_MODELL || 'llama3.1:405b';
const ZIEL =
  process.env.ARASUL_BILDER ||
  path.join(WURZEL, 'docs/plans/audits/2026-10-04-verwaltung-modelle-m5');

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

try {
  pruefe(`Anmeldung als ${BENUTZER}`, angemeldet, grund || '');
  if (!angemeldet) process.exit(1);
  await hinweisWeg(seite);

  await seite.getByTestId('leiste-verwaltung').click();
  await seite.getByTestId('verwaltung-modelle').click();
  const liste = seite.getByTestId('modell-liste');
  await liste.waitFor({ timeout: 30000 });
  // Die Zeilen sind da, wenn auch der Speicher gelesen ist.
  await seite.waitForFunction(
    () =>
      /GB belegt/.test(
        document.querySelector('[data-testid="modelle-speicher"]')?.textContent || ''
      ),
    null,
    { timeout: 30000 }
  );

  const speicher = (await seite.getByTestId('modelle-speicher').textContent()) || '';
  pruefe(
    'Zeile Speicher fuer KI mit Zahlen',
    /Speicher für KI.*GB belegt.*frei/.test(speicher),
    speicher.trim()
  );

  const zeilen = await liste.locator(':scope > li').count();
  pruefe('Je Modell am Geraet eine Zeile', zeilen >= 1, `${zeilen} Zeilen`);
  const text = (await liste.textContent()) || '';
  pruefe(
    'Zeilen nennen Faehigkeiten, warm und die Flows',
    /Text/.test(text) &&
      /warm: (ja|nein)/.test(text) &&
      /(Genutzt von:|Kein Flow nutzt es)/.test(text)
  );
  pruefe(
    'Kein Knopf zum Laden oder Entladen von Hand',
    (await seite
      .getByTestId('modelle-seite')
      .getByRole('button', { name: /In den Speicher|Aus dem Speicher|Laden|Entladen/i })
      .count()) === 0
  );

  const standardZeile = liste
    .locator('li', {
      has: seite.locator('[data-testid^="standard-"]:not([data-testid^="standard-setzen-"])'),
    })
    .first();
  const entfernen = standardZeile.locator('[data-testid^="entfernen-"]');
  pruefe('Das Standardmodell traegt das Abzeichen Standard', (await standardZeile.count()) === 1);
  pruefe('Entfernen des Standardmodells ist gesperrt (Knopf aus)', await entfernen.isDisabled());
  const gesperrt = (await entfernen.getAttribute('title')) || '';
  pruefe('Die Sperre nennt den Grund', gesperrt.length > 20, gesperrt.slice(0, 120));

  await seite.screenshot({ path: path.join(ZIEL, 'modelle-uebersicht.png'), fullPage: true });

  const feld = seite.getByTestId('modell-hinzufuegen-kennung');
  await feld.scrollIntoViewIfNeeded();
  await feld.fill(ZU_GROSS);
  await seite.getByTestId('modell-hinzufuegen-absenden').click();
  const abweisung = seite.getByTestId('modell-abweisung');
  await abweisung.waitFor({ timeout: 60000 });
  const satz = (await abweisung.textContent()) || '';
  pruefe(
    'Das zu grosse Modell wird mit der Pruefung abgewiesen',
    /zu groß/.test(satz),
    satz.trim()
  );
  pruefe(
    'Es wurde nichts geladen (kein Fortschritt)',
    (await seite.getByTestId('modell-hinzufuegen-zustand').count()) === 0
  );
  await seite.screenshot({
    path: path.join(ZIEL, 'modelle-hinzufuegen-abweisung.png'),
    fullPage: true,
  });
} finally {
  await kontext.close();
  await browser.close();
}

console.log(`\nBilder in ${path.relative(WURZEL, ZIEL)}`);
process.exit(rot === 0 ? 0 : 1);
