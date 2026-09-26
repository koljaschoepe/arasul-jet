/**
 * Browser-Teil der Abnahme „Die Bibliothek misst den Behaelter" (J35).
 *
 * Je App aus ARASUL_APPS: der Rahmen in der Shell bei 900, 1000 und 1150 px
 * Breite, einmal ohne und einmal mit Notizspalte. Gezielt wird auf die
 * RAHMENbreite, nicht auf das Fenster -- das Fenster wird so lange verstellt,
 * bis der Rahmen die Zielbreite hat (die Notizspalte nimmt einen Anteil, und
 * eine feste Rechnung stimmte beim naechsten Stand der Shell nicht mehr).
 *
 * Gefragt wird im Dokument der App: scrollWidth gegen clientWidth, ob die
 * Tabelle in ihrem eigenen Rollkasten Spalten versteckt, dazu die Form der
 * Datenliste und die drei aeussersten Elemente, die ueber den Rand
 * ragen -- eine Zahl ohne Element liesse offen, was abschneidet.
 *
 * Rot zaehlt nur fuer die Apps aus ARASUL_PFLICHT; ein Vorher darf rot sein.
 * Bilder unter docs/plans/audits/<tag>-marken-misst-den-behaelter/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const APPS = (process.env.ARASUL_APPS || 'probe-behaelter-neu').split(/\s+/).filter(Boolean);
const PFLICHT = new Set((process.env.ARASUL_PFLICHT || APPS.join(' ')).split(/\s+/).filter(Boolean));
const BREITEN = [900, 1000, 1150];
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-marken-misst-den-behaelter`);

const ergebnisse = [];
const pruefe = (was, ok, detail = '', zaehlt = true) => {
  if (zaehlt) ergebnisse.push({ was, ok });
  const marke = ok ? 'gruen' : zaehlt ? 'ROT  ' : 'rot  ';
  console.log(`${marke}  ${was}${detail ? `  (${detail})` : ''}`);
};

fs.mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const anmeldung = await ctx.request.post(`${URL}/api/auth/login`, {
  data: { username: BENUTZER, password: PASSWORT },
});
pruefe(`${BENUTZER} meldet sich an`, anmeldung.status() === 200, `HTTP ${anmeldung.status()}`);
if (anmeldung.status() !== 200) process.exit(1);
const page = await ctx.newPage();

async function mass(id) {
  return page.evaluate(appId => {
    const f = document.querySelector(`[data-testid="app-rahmen-${appId}"]`);
    if (!f || !f.contentDocument) return null;
    const d = f.contentDocument;
    const cw = d.documentElement.clientWidth;
    const raus = [...d.querySelectorAll('body *')]
      .filter(e => e.getBoundingClientRect().right > cw + 1)
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .slice(0, 3)
      .map(e => {
        const klasse = typeof e.className === 'string' ? e.className.split(' ')[0] : '';
        return `${e.tagName.toLowerCase()}${klasse ? '.' + klasse : ''} r=${Math.round(e.getBoundingClientRect().right)}`;
      });
    const kasten = d.querySelector('[data-slot="datenliste"] [data-slot="table-container"]');
    return {
      tabelleRollt: kasten ? kasten.scrollWidth > kasten.clientWidth + 1 : false,
      rahmen: Math.round(f.getBoundingClientRect().width),
      sw: d.documentElement.scrollWidth,
      cw,
      form: d.querySelector('[data-slot="datenliste"]')?.getAttribute('data-form') ?? '—',
      raus,
    };
  }, id);
}

/** Das Fenster verstellen, bis der Rahmen `ziel` breit ist. */
async function rahmenAuf(id, ziel) {
  let fenster = page.viewportSize().width;
  for (let versuch = 0; versuch < 6; versuch++) {
    const m = await mass(id);
    if (!m) return null;
    if (Math.abs(m.rahmen - ziel) <= 1) return m;
    fenster = Math.max(900, fenster + (ziel - m.rahmen));
    await page.setViewportSize({ width: fenster, height: 900 });
    await page.waitForTimeout(700);
  }
  return mass(id);
}

async function notizen(offen) {
  const zeigen = page.getByRole('button', { name: 'Notizen einblenden' });
  const verbergen = page.getByRole('button', { name: 'Notizen ausblenden' });
  if (offen && (await zeigen.count())) await zeigen.first().click();
  if (!offen && (await verbergen.count())) await verbergen.first().click();
  await page.waitForTimeout(500);
}

for (const id of APPS) {
  const zaehlt = PFLICHT.has(id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${URL}/workspace/app/${id}`, { waitUntil: 'networkidle' });
  const rahmen = page.frameLocator(`[data-testid="app-rahmen-${id}"]`);
  try {
    await rahmen.locator('[data-slot="datenliste"]').first().waitFor({ state: 'visible', timeout: 30000 });
  } catch {
    pruefe(`${id}: die Datenliste steht im Rahmen`, false, 'nach 30 s nicht da', zaehlt);
    continue;
  }
  for (const mitNotizen of [false, true]) {
    await notizen(mitNotizen);
    for (const ziel of BREITEN) {
      const m = await rahmenAuf(id, ziel);
      const name = `${id} · Rahmen ${ziel} px · ${mitNotizen ? 'mit' : 'ohne'} Notizen`;
      if (!m) {
        pruefe(name, false, 'kein Rahmen', zaehlt);
        continue;
      }
      // Zwei Fragen: schneidet die Seite ab, und versteckt die Tabelle Spalten
      // in ihrem eigenen Rollkasten? Das zweite ist kein Abschneiden, aber die
      // Spalten rechts saehe nur, wer dort seitlich rollt.
      const ok = m.sw <= m.cw && !m.tabelleRollt && Math.abs(m.rahmen - ziel) <= 1;
      pruefe(
        name,
        ok,
        `Rahmen ${m.rahmen}, Fenster ${page.viewportSize().width}, scrollWidth ${m.sw} gegen clientWidth ${m.cw}, Liste als ${m.form}${m.tabelleRollt ? ' (rollt im eigenen Kasten)' : ''}${m.raus.length ? ', ragt: ' + m.raus.join(', ') : ''}`,
        zaehlt
      );
      await page.screenshot({
        path: path.join(ZIEL, `${id}-${ziel}-${mitNotizen ? 'mit' : 'ohne'}-notizen.png`),
      });
    }
  }
  await notizen(false);
}

await browser.close();
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\nBrowser: ${ergebnisse.length - rot} von ${ergebnisse.length} gruen, Bilder unter ${path.relative(WURZEL, ZIEL)}`);
process.exit(rot === 0 ? 0 : 1);
