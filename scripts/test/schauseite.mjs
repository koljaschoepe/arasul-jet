/**
 * Die Schauseite der Bibliothek: die Abnahme (Phase H3, 29.08.2026).
 *
 * WAS GEMESSEN WIRD. Sechsundzwanzig Primitive, zwei Themes, drei Breiten --
 * und je Zelle vier Fragen:
 *
 *   1. STEHT JEDES STUECK DA. Die Seite traegt je Primitiv ein
 *      `data-schaustueck`; gezaehlt wird gegen die Dateien in
 *      `packages/marken/src/primitive/`. Ein Baustein, der beim Rendern
 *      wirft, hinterlaesst auf einem Bild einen Fleck, der wie Abstand
 *      aussieht -- gezaehlt faellt er auf.
 *   2. IST DIE FLAECHE DIE DES THEMES. `--background` ist im Hellen
 *      `#F6F6F6` und im Dunklen `#141414`. Zwei Bilder, die gleich aussehen,
 *      sind der haeufigste stille Fehlschlag eines Theme-Umbaus (H1), und bei
 *      einer Bibliothek, deren Bausteine heute niemand benutzt, faellt es
 *      sonst gar nicht auf.
 *   3. ROLLT DIE SEITE WAAGERECHT. Dieselbe Frage wie in der
 *      Oberflaechen-Abnahme, und aus demselben Grund: ein Baustein, der bei
 *      390 px eine feste Breite mitbringt, schiebt die ganze Seite.
 *   4. SAGT DIE KONSOLE ETWAS. Ein fehlender Radix-Provider meldet sich dort
 *      und nirgends sonst -- der Baustein rendert, tut aber nichts.
 *
 * Dazu ein Bild je Zelle: sechs Stueck, hell und dunkel bei 390, 1024, 1440.
 *
 * SIE LAEUFT NEBEN `abnahmen.sh`, wie die Browser-Abnahmen aus D2 bis D6 und
 * die Theme-Abnahme aus H1, und kostet EINE Anmeldung: das Theme wird ueber
 * `PUT /api/darstellung` umgestellt, nicht durch ein zweites Anmelden.
 *
 * AUFGERAEUMT WIRD IMMER: am Ende steht das Theme des Pruefbenutzers wieder
 * auf `light`, auch wenn unterwegs etwas rot war. Sonst faende der naechste
 * Lauf ein Geraet, das er selbst umgestellt hat.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_PASSWORT=... node scripts/test/schauseite.mjs
 *
 * Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TAG.
 * Die Bilder landen unter `docs/plans/audits/<datum>-oberflaeche/`.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request as pwRequest } from 'playwright';
import {
  drosselAbwarten,
  drosselBilanz,
  drosselMerken,
  drosselNochmalNach,
  drosselSchlafen,
  seitenladungAbwarten,
} from './drossel.mjs';
import { pruefbenutzerAnlegen } from './anmeldung.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'pruefer';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-oberflaeche`);
const ADRESSE = `${URL}/entwickler/bausteine`;
const gastgeber = new global.URL(URL).hostname;

/** Dieselben drei Breiten wie in der Oberflaechen-Abnahme (D6). */
const BREITEN = [
  { px: 390, hoehe: 844 },
  { px: 1024, hoehe: 768 },
  { px: 1440, hoehe: 900 },
];

/**
 * Die Flaechenfarbe je Theme, so wie sie in `theme.css` steht.
 *
 * Hier stehen die Werte ein zweites Mal, und das ist Absicht: eine Abnahme,
 * die den erwarteten Wert aus der geprueften Datei liest, prueft nichts.
 */
const THEMES = [
  { name: 'hell', wert: 'light', attribut: null, flaeche: 'rgb(246, 246, 246)' },
  { name: 'dunkel', wert: 'dark', attribut: 'dark', flaeche: 'rgb(20, 20, 20)' },
];

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return ok;
}

function einzeilig(text, laenge = 160) {
  return String(text || '')
    .split('\n')[0]
    .slice(0, laenge);
}

/**
 * Wie viele Primitive es gibt -- gezaehlt an den Dateien, nicht an einer Zahl
 * in dieser Datei. Eine Abnahme, die ihre eigene Erwartung pflegt, misst
 * irgendwann die Pflege statt das Produkt.
 */
function primitiveAmOrt() {
  const ordner = path.join(WURZEL, 'packages/marken/src/primitive');
  return fs
    .readdirSync(ordner)
    .filter(n => n.endsWith('.tsx'))
    .map(n => n.replace(/\.tsx$/, ''))
    .map(n =>
      n
        .split('-')
        .map(t => t[0].toUpperCase() + t.slice(1))
        .join('')
    )
    .sort();
}

// ---------------------------------------------------------------------------
// Wege zum Geraet
// ---------------------------------------------------------------------------

/** Ein Rufkanal mit Bearer und OHNE Cookies -- dann greift die CSRF-Pflicht nicht. */
async function apiKanal(token) {
  return pwRequest.newContext({
    baseURL: URL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: token ? { authorization: `Bearer ${token}` } : {},
  });
}

let anmeldungen = 0;

/** Eine Anmeldung ueber die Schnittstelle. Ein 401 legt den Pruefbenutzer an (G1). */
async function anmelden(benutzer, passwort, { angelegt = false } = {}) {
  await drosselAbwarten('anmeldung', 1);
  const kanal = await pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
  try {
    anmeldungen += 1;
    const antwort = await kanal.post('/api/auth/login', {
      data: { username: benutzer, password: passwort },
    });
    drosselMerken('POST', '/api/auth/login', antwort.headers(), antwort.status());
    if (antwort.status() === 200) {
      const rumpf = await antwort.json();
      return { token: rumpf.token ?? '', code: 200 };
    }
    if (antwort.status() === 429) {
      await drosselSchlafen('anmeldung', drosselNochmalNach('anmeldung'));
      return anmelden(benutzer, passwort, { angelegt });
    }
    if (antwort.status() === 401 && !angelegt) {
      const gelegt = pruefbenutzerAnlegen({ benutzer, passwort });
      console.log(`       Pruefbenutzer: ${gelegt.meldung}`);
      if (gelegt.ok) return anmelden(benutzer, passwort, { angelegt: true });
    }
    return { token: '', code: antwort.status() };
  } catch (fehler) {
    return { token: '', code: `Ausnahme: ${einzeilig(fehler.message, 100)}` };
  } finally {
    await kanal.dispose();
  }
}

async function laden(seite, adresse) {
  await seitenladungAbwarten();
  return seite.goto(adresse, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

/**
 * Warten, bis die Flaeche steht.
 *
 * `body` traegt `transition: background-color var(--transition-slow)` (0,3 s);
 * wer mitten darin liest, misst die Farbe des vorigen Themes. Laeuft die
 * Grenze ab, wird gemessen, was dasteht -- die Zeile darunter nennt den Wert
 * und ist dann rot, und das ist die richtige Auskunft.
 */
async function flaecheAbwarten(seite, erwartet, grenze = 4000) {
  await seite
    .waitForFunction(soll => getComputedStyle(document.body).backgroundColor === soll, erwartet, {
      timeout: grenze,
    })
    .catch(() => {});
}

/** Was die Seite ueber sich sagt: Theme, Flaeche, Stuecke, Rollbreite. */
async function standLesen(seite) {
  return seite.evaluate(() => ({
    attribut: document.documentElement.getAttribute('data-theme'),
    flaeche: getComputedStyle(document.body).backgroundColor,
    stuecke: [...document.querySelectorAll('[data-schaustueck]')].map(el =>
      el.getAttribute('data-schaustueck')
    ),
    rollbreite: document.documentElement.scrollWidth,
    sichtbreite: document.documentElement.clientWidth,
  }));
}

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------

async function main() {
  if (!PASSWORT) {
    console.error('ARASUL_PASSWORT fehlt.');
    process.exit(2);
  }
  fs.mkdirSync(ZIEL, { recursive: true });

  const erwartet = primitiveAmOrt();
  console.log(`\n=== Schauseite (H3) — ${erwartet.length} Primitive, 2 Themes, 3 Breiten ===\n`);

  const angemeldet = await anmelden(BENUTZER, PASSWORT);
  if (!pruefe('Anmeldung des Pruefbenutzers', angemeldet.code === 200, `HTTP ${angemeldet.code}`)) {
    return;
  }

  const browser = await chromium.launch();
  const kanal = await apiKanal(angemeldet.token);
  const gemacht = [];
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.addCookies([
      {
        name: 'arasul_session',
        value: angemeldet.token,
        domain: gastgeber,
        path: '/',
        secure: true,
        sameSite: 'Strict',
      },
    ]);
    const seite = await ctx.newPage();

    // Die Konsole wird je Zelle geleert und danach gelesen. Ein fehlender
    // Radix-Provider meldet sich dort und nirgends sonst.
    let konsole = [];
    seite.on('console', m => {
      if (m.type() === 'error' || m.type() === 'warning') konsole.push(einzeilig(m.text(), 120));
    });
    seite.on('pageerror', f => konsole.push(`pageerror: ${einzeilig(f.message, 120)}`));

    for (const theme of THEMES) {
      const gesetzt = await kanal.put('/api/darstellung', { data: { theme: theme.wert } });
      if (
        !pruefe(
          `Theme »${theme.name}« gesetzt`,
          gesetzt.status() === 200,
          `HTTP ${gesetzt.status()}`
        )
      ) {
        continue;
      }

      for (const breite of BREITEN) {
        await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
        konsole = [];
        await laden(seite, ADRESSE);
        await seite
          .waitForSelector('[data-schaustueck="Button"]', { timeout: 30000 })
          .catch(() => {});
        await seite
          .waitForFunction(
            soll => document.documentElement.getAttribute('data-theme') === soll,
            theme.attribut,
            { timeout: 15000 }
          )
          .catch(() => {});
        await flaecheAbwarten(seite, theme.flaeche);

        const stand = await standLesen(seite);
        const datei = `schauseite-${theme.name}-${breite.px}.png`;
        await seite
          .screenshot({ path: path.join(ZIEL, datei), fullPage: true })
          .catch(() => {});
        gemacht.push(datei);

        const fehlen = erwartet.filter(n => !stand.stuecke.includes(n));
        pruefe(
          `${breite.px} px · ${theme.name} · alle ${erwartet.length} Stuecke`,
          fehlen.length === 0,
          fehlen.length ? `es fehlen: ${fehlen.join(', ')}` : `${stand.stuecke.length} gezaehlt`
        );
        pruefe(
          `${breite.px} px · ${theme.name} · die Flaeche ist die des Themes`,
          stand.attribut === theme.attribut && stand.flaeche === theme.flaeche,
          `data-theme=${stand.attribut}, Flaeche ${stand.flaeche}`
        );
        pruefe(
          `${breite.px} px · ${theme.name} · rollt nicht waagerecht`,
          stand.rollbreite <= stand.sichtbreite + 1,
          `${stand.rollbreite} gegen ${stand.sichtbreite}`
        );
        pruefe(
          `${breite.px} px · ${theme.name} · die Konsole schweigt`,
          konsole.length === 0,
          konsole.slice(0, 3).join(' | ')
        );
      }
    }
    await ctx.close();
  } finally {
    // Immer, auch nach einem roten Lauf: das Geraet steht danach so da, wie es
    // vorher stand.
    await kanal
      .put('/api/darstellung', { data: { theme: 'light' } })
      .catch(() => {});
    await kanal.dispose();
    await browser.close();
  }
  console.log(`\n       ${gemacht.length} Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
}

await main();

const rot = ergebnisse.filter(e => !e.ok);
console.log('\n-----------------------------------------------------------');
console.log(
  `${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen, ${anmeldungen} Anmeldungen ausgegeben.`
);
console.log(drosselBilanz());
if (rot.length) {
  console.log('\nRot:');
  for (const e of rot) console.log(`  - ${e.was}`);
}
process.exit(rot.length ? 1 : 0);
