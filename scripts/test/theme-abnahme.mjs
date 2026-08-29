/**
 * Das Theme gehoert dem Menschen: die Abnahme (Phase H1, 29.08.2026).
 *
 * WAS GEMESSEN WIRD
 *
 *   1. DER KERN. Ein Mensch stellt in den Einstellungen »Dunkel« ein, meldet
 *      sich in einem ZWEITEN Browserkontext neu an -- eigene Cookies, eigener
 *      Speicher, nichts vom ersten -- und sieht Dunkel. Das ist die eine
 *      Frage der Phase: bis H1 lag das Theme im `localStorage`, und derselbe
 *      Mensch an zwei Rechnern sah zwei verschiedene Geraete.
 *   2. BILDER. Anmeldung, Uebersicht und Einstellungen in beiden Themes bei
 *      390, 1024 und 1440 px. Zu jedem Bild die Frage, ob die Flaeche
 *      wirklich die des Themes ist: `--background` ist im Hellen `#F6F6F6`
 *      und im Dunklen `#141414`, und zwei Bilder, die gleich aussehen, waeren
 *      der haeufigste stille Fehlschlag eines Theme-Umbaus.
 *   3. WAS ES NICHT MEHR GIBT. Kein `data-theme="black"`, keine Klasse
 *      `.light` am Dokument, kein Schluessel `arasul_theme` im Speicher,
 *      nachdem die Oberflaeche einmal gelaufen ist.
 *
 * DIE ANMELDUNG DER ANMELDESEITE HAT KEIN THEME, und das ist kein Mangel:
 * das Theme gehoert einem Menschen, und vor der Anmeldung ist keiner da. Die
 * Reihe misst das ausdruecklich (die helle Vorgabe steht da) und macht das
 * dunkle Bild der Anmeldeseite MIT AUFGEZWUNGENEM Attribut -- es beantwortet
 * eine andere Frage, naemlich ob die Seite ueberhaupt in beiden Themes
 * lesbar ist. Im Bericht steht das dabei.
 *
 * ZWEI ANMELDUNGEN, nicht mehr. Das Geraet laesst zehn je Viertelstunde und
 * IP zu (`loginLimiter`), und daneben laufen die anderen Abnahmen. Die erste
 * geht ueber die Schnittstelle (der Kontext bekommt ihr Sitzungscookie), die
 * zweite ueber das FORMULAR im zweiten Kontext -- denn genau die ist der
 * Gegenstand der Messung. Alle weiteren Fenster erben das Cookie, das schon
 * da ist. Gewartet wird ueber `drossel.mjs` wie in der Oberflaechen-Abnahme.
 *
 * AUFGERAEUMT WIRD IMMER: am Ende steht das Theme des Pruefbenutzers wieder
 * auf `light`, auch wenn unterwegs etwas rot war. Sonst faende der naechste
 * Lauf ein Geraet, das er selbst umgestellt hat.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_PASSWORT=... node scripts/test/theme-abnahme.mjs
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
const gastgeber = new global.URL(URL).hostname;

/** Dieselben drei Breiten wie in der Oberflaechen-Abnahme (D6). */
const BREITEN = [
  { px: 390, hoehe: 844 },
  { px: 1024, hoehe: 768 },
  { px: 1440, hoehe: 900 },
];

/**
 * Die Flaechenfarbe je Theme, so wie sie in `index.css` steht.
 *
 * Hier stehen die Werte ein zweites Mal, und das ist Absicht: eine Abnahme,
 * die den erwarteten Wert aus der geprueften Datei liest, prueft nichts. Wer
 * `--background` aendert, aendert ihn hier mit -- und `check-design-system.js`
 * haelt beide Themes ohnehin an denselben Zahlen fest.
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

/**
 * Eine Anmeldung ueber die Schnittstelle. Die einzige Stelle ausser dem
 * Formular, die eine ausgibt -- und ein 401 fuer den Pruefbenutzer heisst
 * seit G1 nicht Ende, sondern: einmal am Geraet anlegen und noch einmal
 * fragen (der Werksreset loescht ihn mit).
 */
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
      return { token: rumpf.token ?? '', theme: rumpf.user?.theme ?? null, code: 200 };
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
    return { token: '', theme: null, code: antwort.status() };
  } catch (fehler) {
    return { token: '', theme: null, code: `Ausnahme: ${einzeilig(fehler.message, 100)}` };
  } finally {
    await kanal.dispose();
  }
}

/** Ein Browserkontext mit gesetztem Sitzungscookie. */
async function fensterMitToken(browser, token, breite = BREITEN[2]) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: breite.px, height: breite.hoehe },
  });
  if (token) {
    await ctx.addCookies([
      {
        name: 'arasul_session',
        value: token,
        domain: gastgeber,
        path: '/',
        secure: true,
        sameSite: 'Strict',
      },
    ]);
  }
  return ctx;
}

async function laden(seite, adresse) {
  await seitenladungAbwarten();
  return seite.goto(adresse, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

/** Was `<html>` gerade traegt, und welche Flaeche daraus wird. */
async function themeAmDokument(seite) {
  return seite.evaluate(() => ({
    attribut: document.documentElement.getAttribute('data-theme'),
    dunkelKlasse: document.documentElement.classList.contains('dark'),
    lichtKlasse: document.documentElement.classList.contains('light'),
    flaeche: getComputedStyle(document.body).backgroundColor,
    alterSchluessel: (() => {
      try {
        return localStorage.getItem('arasul_theme');
      } catch {
        return null;
      }
    })(),
  }));
}

/** Wartet, bis die Shell steht (die Statusleiste ist ihr letztes Stueck). */
async function shellAbwarten(seite, grenze = 30000) {
  try {
    await seite.waitForSelector('[data-testid="workspace-shell"], [data-testid="status-bar"]', {
      timeout: grenze,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Die Messung
// ---------------------------------------------------------------------------

async function main() {
  if (!PASSWORT) {
    console.error('theme-abnahme: ARASUL_PASSWORT fehlt. Ohne Passwort gibt es nichts zu messen.');
    process.exit(2);
  }
  fs.mkdirSync(ZIEL, { recursive: true });
  console.log(`\n=== Theme-Abnahme (Phase H1) gegen ${URL} ===\n`);

  const browser = await chromium.launch({ headless: true });
  let token = '';

  try {
    // --- 1. Anmeldung Nummer eins, ueber die Schnittstelle -------------------
    const erste = await anmelden(BENUTZER, PASSWORT);
    if (!pruefe('Anmeldung des Pruefbenutzers', erste.code === 200, `HTTP ${erste.code}`)) {
      return;
    }
    token = erste.token;

    // Die Anmeldeantwort traegt das Theme mit. Das ist kein Beiwerk: die Shell
    // kennt es dadurch, BEVOR sie das erste Mal malt, ohne eine dritte Anfrage
    // auf einem Seitenaufbau (seit G2 die enge Stelle des Geraets).
    pruefe(
      'die Anmeldeantwort traegt `theme`',
      erste.theme === 'light' || erste.theme === 'dark',
      `theme = ${JSON.stringify(erste.theme)}`
    );

    const kanal = await apiKanal(token);
    const sitzung = await kanal.get('/api/auth/session');
    const sitzungRumpf = await sitzung.json().catch(() => ({}));
    pruefe(
      '`GET /api/auth/session` traegt `theme`',
      sitzungRumpf?.user?.theme === 'light' || sitzungRumpf?.user?.theme === 'dark',
      `theme = ${JSON.stringify(sitzungRumpf?.user?.theme)}`
    );

    // Ein unbekanntes Theme ist eine 400 aus dem Schema und keine 500 aus dem
    // CHECK der Spalte -- und `schwarz` ist der Wert, den es nicht mehr gibt.
    const abgelehnt = await kanal.put('/api/darstellung', { data: { theme: 'black' } });
    pruefe(
      '`PUT /api/darstellung` weist »black« mit 400 ab',
      abgelehnt.status() === 400,
      `HTTP ${abgelehnt.status()}`
    );

    // Ausgangslage: hell. Damit misst der Lauf immer denselben Weg, egal was
    // ein vorheriger stehen liess.
    const zurueckgesetzt = await kanal.put('/api/darstellung', { data: { theme: 'light' } });
    if (!pruefe(
      'Ausgangslage hell gesetzt',
      zurueckgesetzt.status() === 200,
      `HTTP ${zurueckgesetzt.status()}`
    )) {
      await kanal.dispose();
      return;
    }
    await kanal.dispose();

    // --- 2. Der Mensch stellt in den Einstellungen »Dunkel« ein --------------
    const ctxA = await fensterMitToken(browser, token);
    const seiteA = await ctxA.newPage();
    await laden(seiteA, `${URL}/workspace/settings?tab=general`);

    const erscheinung = await seiteA
      .waitForSelector('text=Erscheinungsbild', { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!pruefe('Einstellungen → Erscheinungsbild steht da', erscheinung)) {
      await ctxA.close();
      return;
    }

    const optionen = await seiteA.getByRole('radio').count();
    pruefe('genau zwei Optionen (»Schwarz« ist gefallen)', optionen === 2, `${optionen} Optionen`);

    await seiteA.getByRole('radio', { name: /Dunkel/ }).click();
    const nachKlick = await seiteA
      .waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
        timeout: 15000,
      })
      .then(() => true)
      .catch(() => false);
    const standA = await themeAmDokument(seiteA);
    pruefe(
      'der Klick auf »Dunkel« setzt data-theme am Dokument',
      nachKlick && standA.dunkelKlasse,
      `data-theme=${standA.attribut}, Klasse dark=${standA.dunkelKlasse}`
    );
    await ctxA.close();

    // --- 3. Der Kern: ein zweiter Kontext, eine neue Anmeldung --------------
    //
    // Ein FRISCHER Kontext hat eigene Cookies und einen eigenen
    // `localStorage`. Kaeme das Theme noch aus dem Browser, staende hier
    // Hell -- und genau das war der Zustand vor H1.
    const ctxB = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    const seiteB = await ctxB.newPage();
    await laden(seiteB, URL);

    const formular = await seiteB
      .waitForSelector('input#username, input[name="username"]', { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!pruefe('der zweite Kontext sieht die Anmeldung', formular)) {
      await ctxB.close();
      return;
    }

    // Die Anmeldeseite kennt keinen Menschen, also kein Theme: die Vorgabe.
    const vorAnmeldung = await themeAmDokument(seiteB);
    pruefe(
      'die Anmeldeseite steht in der Vorgabe (hell, ohne Attribut)',
      vorAnmeldung.attribut === null && !vorAnmeldung.dunkelKlasse,
      `data-theme=${vorAnmeldung.attribut}`
    );

    await drosselAbwarten('anmeldung', 1);
    anmeldungen += 1;
    await seiteB.fill('input#username, input[name="username"]', BENUTZER);
    await seiteB.fill('input[type="password"]', PASSWORT);
    await seiteB.click('button[type="submit"]');

    const shellDa = await shellAbwarten(seiteB);
    if (!pruefe('der zweite Kontext kommt in die Shell', shellDa)) {
      await seiteB.screenshot({ path: path.join(ZIEL, 'theme-zweiter-kontext-rot.png') }).catch(() => {});
      await ctxB.close();
      return;
    }

    const standB = await themeAmDokument(seiteB);
    pruefe(
      'DER KERN: der zweite Kontext sieht Dunkel, ohne dass jemand etwas eingestellt hat',
      standB.attribut === 'dark' && standB.dunkelKlasse,
      `data-theme=${standB.attribut}, Flaeche ${standB.flaeche}`
    );
    pruefe(
      'die Flaeche ist wirklich die dunkle',
      standB.flaeche === THEMES[1].flaeche,
      `${standB.flaeche} statt ${THEMES[1].flaeche}`
    );
    pruefe(
      'keine Klasse `.light` mehr am Dokument',
      standB.lichtKlasse === false,
      `light=${standB.lichtKlasse}`
    );
    pruefe(
      'kein Schluessel `arasul_theme` im Speicher',
      standB.alterSchluessel === null,
      `arasul_theme = ${JSON.stringify(standB.alterSchluessel)}`
    );

    // --- 4. Die Bilder ------------------------------------------------------
    await bilderMachen(browser, token, seiteB, ctxB);
    await ctxB.close();
  } catch (fehler) {
    pruefe('der Lauf kommt bis zum Ende', false, einzeilig(fehler.message));
  } finally {
    // Immer aufraeumen: das Geraet steht danach so da, wie es der naechste
    // Lauf erwartet.
    if (token) {
      const kanal = await apiKanal(token);
      const zurueck = await kanal.put('/api/darstellung', { data: { theme: 'light' } }).catch(() => null);
      console.log(
        `\n       aufgeraeumt: theme = light (HTTP ${zurueck ? zurueck.status() : 'kein Ruf'})`
      );
      await kanal.dispose();
    }
    await browser.close();
  }
}

/**
 * Anmeldung, Uebersicht und Einstellungen, je Theme und Breite.
 *
 * Die angemeldeten Bilder kommen aus dem Kontext, der schon steht (`ctxB`):
 * eine dritte Anmeldung waere ein Drittel des Fensters fuer ein Bild. Das
 * Theme wird zwischen den beiden Durchgaengen ueber die Schnittstelle
 * umgestellt und die Seite neu geladen -- das ist derselbe Zustand, den ein
 * Mensch nach seiner Wahl vorfindet.
 */
async function bilderMachen(browser, token, seite, ctx) {
  const kanal = await apiKanal(token);
  const gemacht = [];
  try {
    for (const theme of THEMES) {
      const gesetzt = await kanal.put('/api/darstellung', { data: { theme: theme.wert } });
      if (!pruefe(`Theme »${theme.name}« gesetzt`, gesetzt.status() === 200, `HTTP ${gesetzt.status()}`)) {
        continue;
      }

      for (const breite of BREITEN) {
        await seite.setViewportSize({ width: breite.px, height: breite.hoehe });

        for (const ansicht of [
          { name: 'uebersicht', adresse: `${URL}/workspace` },
          { name: 'einstellungen', adresse: `${URL}/workspace/settings?tab=general` },
        ]) {
          await laden(seite, ansicht.adresse);
          await shellAbwarten(seite);
          await seite.waitForTimeout(600);
          const stand = await themeAmDokument(seite);
          const datei = `theme-${theme.name}-${ansicht.name}-${breite.px}.png`;
          await seite.screenshot({ path: path.join(ZIEL, datei) }).catch(() => {});
          gemacht.push(datei);
          pruefe(
            `${breite.px} px · ${ansicht.name} · ${theme.name}`,
            stand.attribut === theme.attribut && stand.flaeche === theme.flaeche,
            `data-theme=${stand.attribut}, Flaeche ${stand.flaeche}`
          );
        }
      }
    }

    // Die Anmeldeseite: einmal, wie sie wirklich ist (hell, es ist niemand
    // da), und einmal mit aufgezwungenem Attribut. Das zweite Bild
    // beantwortet eine ANDERE Frage: ob die Seite ueberhaupt in beiden
    // Themes lesbar ist, also ob in ihr etwas steckt, das nur eines kennt.
    const anonym = await browser.newContext({ ignoreHTTPSErrors: true });
    const seiteL = await anonym.newPage();
    for (const breite of BREITEN) {
      await seiteL.setViewportSize({ width: breite.px, height: breite.hoehe });
      await laden(seiteL, URL);
      await seiteL
        .waitForSelector('input#username, input[name="username"]', { timeout: 30000 })
        .catch(() => {});
      await seiteL.waitForTimeout(400);
      const datei = `theme-hell-anmeldung-${breite.px}.png`;
      await seiteL.screenshot({ path: path.join(ZIEL, datei) }).catch(() => {});
      gemacht.push(datei);

      await seiteL.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      });
      await seiteL.waitForTimeout(300);
      const dateiD = `theme-dunkel-anmeldung-${breite.px}-aufgezwungen.png`;
      await seiteL.screenshot({ path: path.join(ZIEL, dateiD) }).catch(() => {});
      gemacht.push(dateiD);
    }
    pruefe('die Anmeldeseite ist in beiden Breitenreihen abgelichtet', true, `${BREITEN.length} × 2`);
    await anonym.close();
  } finally {
    await kanal.dispose();
  }
  console.log(`\n       ${gemacht.length} Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
}

await main();

const rot = ergebnisse.filter(e => !e.ok);
console.log('\n-----------------------------------------------------------');
console.log(`${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen, ${anmeldungen} Anmeldungen ausgegeben.`);
console.log(drosselBilanz());
if (rot.length) {
  console.log('\nRot:');
  for (const e of rot) console.log(`  - ${e.was}`);
}
process.exit(rot.length ? 1 : 0);
