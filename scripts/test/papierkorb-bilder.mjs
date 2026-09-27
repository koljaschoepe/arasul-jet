/**
 * Der Papierkorb des Firmenordners im Browser (J34, 27.09.2026) -- der Teil
 * der Abnahme, den `papierkorb-abnahme.sh` nicht mit curl messen kann: die
 * Zahl steht in der Liste, der Dialog nennt die Eintraege, und „Papierkorb
 * leeren" leert erst nach der Rueckfrage. Am Handy (390 px) und am Rechner
 * (1440 px), mit Bildern unter `docs/plans/audits/<tag>-papierkorb-j34/`.
 *
 * Aufgerufen von `papierkorb-abnahme.sh`, das vorher gestempelte Eintraege
 * anlegt, die Sitzung baut und danach mit PROPFIND nachzaehlt:
 *   ARASUL_URL, ARASUL_SITZUNG_ADMIN, ARASUL_WURZEL_KENNUNG, ARASUL_ANZAHL
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const SITZUNG = process.env.ARASUL_SITZUNG_ADMIN || '';
const KENNUNG = process.env.ARASUL_WURZEL_KENNUNG || 'firma';
const ANZAHL = process.env.ARASUL_ANZAHL || '';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-papierkorb-j34`);
const SEITE = `${URL}/workspace/settings?tab=firmenordner`;

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push(ok);
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

if (!SITZUNG || !fs.existsSync(SITZUNG)) {
  console.log('ROT    Die Sitzung fehlt -- der Aufrufer baut sie.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function oeffne(breite) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: SITZUNG,
    viewport: { width: breite, height: breite < 900 ? 844 : 900 },
  });
  const seite = await ctx.newPage();
  const fehler = [];
  seite.on('console', m => m.type() === 'error' && fehler.push(m.text()));
  await seite.goto(SEITE, { waitUntil: 'networkidle' });
  await seite.getByTestId('ordner-baum').waitFor({ timeout: 20000 });
  return { ctx, seite, fehler };
}

// Bei 390 px: die Zeile des Hauptordners mit der Zahl, und der Dialog.
{
  const { ctx, seite, fehler } = await oeffne(390);
  const knopf = seite.getByTestId(`ordner-papierkorb-${KENNUNG}`);
  await knopf.waitFor({ timeout: 15000 });
  await seite.waitForFunction(
    k => document.querySelector(`[data-testid="ordner-papierkorb-${k}"]`)?.dataset.anzahl !== '',
    KENNUNG,
    { timeout: 15000 }
  );
  const zahl = await knopf.getAttribute('data-anzahl');
  pruefe(
    '390 px: die Zeile nennt die Zahl im Papierkorb',
    zahl === ANZAHL,
    `${zahl} gegen ${ANZAHL}`
  );
  await seite.screenshot({ path: path.join(ZIEL, '390-ordnerliste.png'), fullPage: true });
  await knopf.click();
  const dialog = seite.getByTestId('papierkorb');
  await dialog.getByTestId('papierkorb-eintrag').first().waitFor({ timeout: 15000 });
  // Der Dialog blendet ein; ein Bild mitten darin zeigt ihn halb durchsichtig.
  await seite.waitForTimeout(500);
  const eintraege = await dialog.getByTestId('papierkorb-eintrag').count();
  pruefe('390 px: der Dialog nennt jeden Eintrag', String(eintraege) === ANZAHL, String(eintraege));
  const breit = await seite.evaluate(() => document.documentElement.scrollWidth);
  pruefe('390 px: nichts rollt waagerecht', breit <= 390, `${breit}`);
  await seite.screenshot({ path: path.join(ZIEL, '390-papierkorb.png') });
  pruefe('390 px: die Konsole schweigt', fehler.length === 0, fehler.join(' | ').slice(0, 200));
  await ctx.close();
}

// Bei 1440 px: dasselbe, und dann leeren -- erst nach der Rueckfrage.
{
  const { ctx, seite, fehler } = await oeffne(1440);
  await seite.screenshot({ path: path.join(ZIEL, '1440-ordnerliste.png'), fullPage: true });
  const baum = await seite.getByTestId('ordner-baum').evaluate(e => [e.scrollWidth, e.clientWidth]);
  pruefe(
    '1440 px: der Ordnerbaum rollt nicht, die Handgriffe stehen da',
    baum[0] <= baum[1],
    `${baum[0]} gegen ${baum[1]}`
  );
  await seite.getByTestId(`ordner-papierkorb-${KENNUNG}`).click();
  const dialog = seite.getByTestId('papierkorb');
  await dialog.getByTestId('papierkorb-eintrag').first().waitFor({ timeout: 15000 });
  await seite.waitForTimeout(500);
  await seite.screenshot({ path: path.join(ZIEL, '1440-papierkorb.png') });

  await seite.getByTestId('papierkorb-leeren').click();
  const frage = seite.getByRole('alertdialog');
  await frage.waitFor({ timeout: 10000 });
  await seite.waitForTimeout(500);
  pruefe('1440 px: Leeren fragt zuerst', await frage.isVisible(), await frage.innerText());
  await seite.screenshot({ path: path.join(ZIEL, '1440-rueckfrage.png') });
  await frage.getByRole('button', { name: 'Endgültig leeren' }).click();
  await dialog.getByText('Der Papierkorb ist leer').waitFor({ timeout: 60000 });
  pruefe('1440 px: danach steht der Papierkorb leer da', true);
  await seite.screenshot({ path: path.join(ZIEL, '1440-geleert.png') });
  pruefe('1440 px: die Konsole schweigt', fehler.length === 0, fehler.join(' | ').slice(0, 200));
  await ctx.close();
}

await browser.close();
console.log(`Bilder: ${path.relative(WURZEL, ZIEL)}/`);
process.exit(ergebnisse.every(Boolean) ? 0 : 1);
