/**
 * Die Oberfläche, ganz: die Ansichten beider Rollen mal drei Breiten.
 * Phase D6 des Umbaus vom 26.08.2026, neu geschnitten am 05.10.2026 (M5).
 *
 * WARUM DIESE DATEI NEU GESCHNITTEN IST. Bis zum 05.10.2026 trug sie einen
 * Benutzer und sein Passwort als Vorgabe, im öffentlichen Repo. Sie legte
 * einen Wegwerf-Mitarbeiter über eine Schnittstelle an, die es so nicht mehr
 * gibt (HTTP 400, danach maß sie nichts mehr), und sie maß an der ersten App
 * mit Livestand, die sie fand, also an einer echten. Dazu fragte sie nach
 * Notizen, Hamburger-Menü und Statusleiste, die mit dem Handy-Auftrag vom
 * 04.10.2026 gefallen sind. Seither:
 *
 *   - Konten nur aus der Umgebung, und nur vorhandene Probekonten: ein
 *     Administrator (probe-admin) und ein Mitarbeiter (probe-j36-a). Kein
 *     Konto wird angelegt, keins geändert, nie `admin`.
 *   - Gemessen wird an einer eigenen Probe-App mit Stempel,
 *     `probe-oberflaeche-<STEMPEL>` aus `tests/probe-leiste` (nur Frontend).
 *     Die Reihe rollt sie über einen Wegwerf-Schlüssel aus, schaltet sie live,
 *     gibt sie dem Mitarbeiter frei und entfernt am Ende alles wieder, auch
 *     nach einem roten Lauf. An einer anderen App misst sie nie.
 *   - Der Startpasswort-Wechsel ist hier nicht mehr dabei: er bräuchte ein
 *     Konto, dessen Passwort der Administrator setzt, und das hieße, ein
 *     Probekonto zu verändern. Die offene Freigabe an der Kachel misst
 *     `freigabe-wer-entscheidet-abnahme.sh` mit einer App, die einen Flow hat.
 *
 * WAS GEMESSEN WIRD
 *
 *   1. Die Kopfzeilen des Dokuments: eine Content-Security-Policy ohne
 *      `unsafe-eval` und vier weitere Sicherheitskopfzeilen.
 *   2. Ansichten mal Breiten (390, 1024, 1440), zu jeder Zelle vier Fragen und
 *      ein Bild: steht die Ansicht (ihr Kennzeichen ist da), rollt die Seite
 *      waagerecht, steht etwas da, meldet die Konsole einen Fehler?
 *        Mitarbeiter: Anmeldung, Startseite, App im Rahmen, Einstellungen.
 *        Administrator: Startseite und die acht Bereiche der Verwaltung
 *        (`ansichten.mjs`).
 *   3. Die Leiste: ab 900 px links über die ganze Höhe, darunter unten über
 *      die ganze Breite (`useSchmalesFenster`).
 *   4. Tastatur: die Reihenfolge durch die Anmeldung und durch die Shell,
 *      Enter meldet an, Escape schließt einen Dialog.
 *   5. Fehlerzustände: ein Mitarbeiter auf einer Admin-Adresse, eine Adresse,
 *      die es nicht gibt, das Backend weg.
 *   6. Kein unerwarteter CSP-Verstoß im ganzen Durchlauf.
 *
 * ANMELDUNGEN: zwei, beide gelingen und kosten die Anmeldedrossel nichts
 * (`loginLimiter` zählt nur Fehlschläge). Der Administrator über die
 * Schnittstelle, sein Token trägt danach Browser und Aufräumen; der
 * Mitarbeiter über das Formular, denn das ist die Messung der Anmeldung.
 * Vor jeder Seitenladung fragt die Reihe die Drosseln (`drossel.mjs`), und
 * eine Zelle, der ein 429 dazwischenkam, wird wiederholt statt rot.
 *
 * VORAUSSETZUNG: `playwright` steht in keinem Lockfile dieses Repos:
 * `npm i --no-save playwright` im Wurzelordner ODER
 * ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>; Chromium über
 * `npx playwright install chromium` oder ARASUL_CHROMIUM=<Datei>.
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   node scripts/test/oberflaeche-abnahme.mjs
 *
 * Umgebung außerdem: ARASUL_URL, ARASUL_STEMPEL, ARASUL_TAG, ARASUL_CHROMIUM.
 * Passwörter nur aus der Umgebung, nie in eine Datei. Die Bilder landen unter
 * `docs/plans/audits/<tag>-oberflaeche/`.
 *
 * Rückgabe 0, wenn jede Frage grün war, sonst 1; 2, wenn Konten fehlen.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  drossel429Seit,
  drossel429Stand,
  drosselAbwarten,
  drosselBilanz,
  drosselMerken,
  drosselNochmalNach,
  drosselSchlafen,
  seitenladungAbwarten,
} from './drossel.mjs';
import { zugangAusUmgebung } from './anmeldung.mjs';
import { BREITEN, SCHMAL_AB_PX, VERWALTUNG } from './ansichten.mjs';

async function ladePlaywright() {
  try {
    return await import('playwright');
  } catch {
    const ort = process.env.ARASUL_PLAYWRIGHT;
    if (!ort) {
      console.log(
        'ROT    playwright fehlt: `npm i --no-save playwright` im Wurzelordner oder ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>.'
      );
      process.exit(1);
    }
    return createRequire(path.join(ort, 'x.js'))('playwright');
  }
}
const { chromium, request: pwRequest } = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const { benutzer: ADMIN, passwort: ADMIN_PASS } = zugangAusUmgebung();
const { benutzer: A, passwort: A_PASS } = zugangAusUmgebung('ARASUL_A', 'ARASUL_A_PASSWORT');
if (A === ADMIN) {
  console.log('ROT    ARASUL_A muss ein anderes Konto sein als ARASUL_BENUTZER (ein Mitarbeiter).');
  process.exit(2);
}

const STEMPEL = process.env.ARASUL_STEMPEL || String(Date.now());
/**
 * Die Probe-App dieses Laufs. Die Kennung ist kein Parameter: an einer echten
 * App des Geräts misst diese Reihe nie, und
 * das Aufräumen entfernt genau das, was sie selbst ausgerollt hat.
 */
const APP = `probe-oberflaeche-${STEMPEL}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const QUELLE = path.join(WURZEL, 'tests/probe-leiste');

const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-oberflaeche`);

// ---------------------------------------------------------------------------
// Buchführung
// ---------------------------------------------------------------------------

/** Die Zellen der Tabelle: je Ansicht und Breite ein grün oder rot. */
const tabelle = new Map();
/** Alles, was keine Zelle ist: CSP, Tastatur, Fehlerzustände, Aufbau. */
const ergebnisse = [];

function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return ok;
}

function zelle(ansicht, breite, ok, detail = '') {
  if (!tabelle.has(ansicht)) tabelle.set(ansicht, new Map());
  const bisher = tabelle.get(ansicht).get(breite);
  tabelle.get(ansicht).set(breite, bisher === false ? false : ok);
  ergebnisse.push({ was: `${breite} px · ${ansicht}`, ok });
  console.log(
    `${ok ? 'gruen' : 'ROT  '}  ${breite} px · ${ansicht}${detail ? `  (${detail})` : ''}`
  );
}

/** Eine Fehlermeldung, die in eine Ergebniszeile passt. */
function einzeilig(text, laenge = 200) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, laenge);
}

// ---------------------------------------------------------------------------
// Die Wege zum Gerät, ohne Browser
// ---------------------------------------------------------------------------

/** Ein Rufkanal mit Bearer oder Schlüssel und OHNE Cookies: dann greift die CSRF-Pflicht nicht. */
async function apiKanal(kopf = {}) {
  return pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true, extraHTTPHeaders: kopf });
}
const mitToken = token => apiKanal({ authorization: `Bearer ${token}` });

/** Horcht jemand unter dieser Adresse? Sonst meldet jede Zeile etwas über den Tunnel. */
async function geraetErreichbar() {
  const kanal = await apiKanal();
  try {
    await kanal.get('/api/health', { timeout: 15000 });
    return true;
  } catch {
    return false;
  } finally {
    await kanal.dispose();
  }
}

/**
 * Die Anmeldung des Administrators über die Schnittstelle. Ein 429 ist eine
 * Wartezeit und kein Ergebnis: einmal abwarten, einmal wiederholen.
 */
async function anmelden(benutzer, passwort) {
  for (let versuch = 1; ; versuch += 1) {
    await drosselAbwarten('anmeldung', 1);
    const kanal = await apiKanal();
    try {
      const antwort = await kanal.post('/api/auth/login', {
        data: { username: benutzer, password: passwort },
      });
      drosselMerken('POST', '/api/auth/login', antwort.headers(), antwort.status());
      if (antwort.status() === 200) return { token: (await antwort.json()).token ?? '', code: 200 };
      if (antwort.status() !== 429 || versuch > 1) return { token: '', code: antwort.status() };
    } catch (fehler) {
      return { token: '', code: `Ausnahme: ${einzeilig(fehler.message, 100)}` };
    } finally {
      await kanal.dispose();
    }
    await drosselSchlafen('anmeldung', drosselNochmalNach('anmeldung'));
  }
}

/** Das Paket der Probe-App: `tests/probe-leiste` mit eigener Kennung und eigenem Namen. */
function paketBauen(arbeit) {
  const ordner = path.join(arbeit, 'paket');
  fs.mkdirSync(ordner, { recursive: true });
  fs.cpSync(path.join(QUELLE, 'frontend'), path.join(ordner, 'frontend'), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(QUELLE, 'app.json'), 'utf-8'));
  manifest.id = APP;
  manifest.name = `Probe Oberfläche ${STEMPEL}`;
  manifest.beschreibung =
    'Messgerät für scripts/test/oberflaeche-abnahme.mjs, wird am Ende entfernt.';
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(manifest, null, 2));
  const datei = path.join(arbeit, 'paket.tgz');
  execFileSync('tar', ['czf', datei, '-C', ordner, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  return datei;
}

// ---------------------------------------------------------------------------
// Der Browser
// ---------------------------------------------------------------------------

const gastgeber = new globalThis.URL(URL).hostname;
const chromiumOptionen = {
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
};

/** Ein Fenster; mit Token eines mit Sitzung, ohne Anmeldung (das Backend liest `arasul_session`). */
async function fenster(browser, token = '') {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
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
  // Der Einrichtungs-Hinweis verdeckte sonst die erste Ansicht.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* Speicher gesperrt, stört nur die Sicht */
    }
  });
  return ctx;
}

/** Eine Seite laden, und vorher fragen, ob das Gerät sie noch annimmt. */
async function laden(seite, pfad) {
  await seitenladungAbwarten();
  return seite.goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

const cspVerstoesse = [];
let konsole = [];

/**
 * Meldungen aus dem iframe einer App gehören nicht der Oberfläche: eine App
 * stammt vom Partner und bringt ihre eigene Konsole mit. Sie werden getrennt
 * gezählt und nicht verschwiegen.
 */
const vonEinerApp = ort => /\/apps\/[^/]+\//.test(ort || '');

/**
 * Konsole, CSP-Verstöße und Drosseln eines Fensters mitschreiben. Ein Verstoß
 * geht sofort hinaus und wird nicht in der Seite gesammelt: das Init-Skript
 * läuft je Navigation neu, und ein Sammeln am Ende kennte nur das letzte
 * Dokument.
 */
async function horchen(ctx, seite) {
  seite.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const ort = m.location()?.url ?? '';
    if (/Content.Security.Policy/i.test(text)) {
      cspVerstoesse.push({ quelle: 'konsole', text: text.slice(0, 240) });
      return;
    }
    konsole.push({ text: text.slice(0, 200), app: vonEinerApp(ort) });
  });
  seite.on('pageerror', e =>
    konsole.push({ text: `pageerror: ${String(e.message).slice(0, 200)}`, app: false })
  );
  seite.on('response', a => {
    try {
      const pfad = new globalThis.URL(a.url()).pathname;
      drosselMerken(a.request().method(), pfad, a.headers(), a.status());
    } catch {
      /* keine gewöhnliche Adresse (data:, blob:) */
    }
  });
  await ctx.exposeBinding('__arasulCspMelden', (_quelle, v) => {
    cspVerstoesse.push({ quelle: 'seite', ...v });
  });
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      window.__arasulCspMelden({
        richtlinie: e.effectiveDirective || e.violatedDirective,
        blockiert: (e.blockedURI || '').slice(0, 200),
        datei: (e.sourceFile || '').split('/').pop() || '',
        zeile: e.lineNumber,
      });
    });
  });
}

/**
 * Bekannt und geprüft harmlos (22.08.2026 am Orin): eine Bibliothek im
 * Hauptbündel fragt mit `new Function("")`, ob sie kompilieren darf, und fängt
 * den Fehler ab. Bewusst eng gefasst: nur `script-src` mit `eval`.
 */
const bekannteEvalProbe = v =>
  v.quelle === 'konsole'
    ? /unsafe-eval/.test(v.text || '')
    : v.richtlinie === 'script-src' && v.blockiert === 'eval';

const steht = (seite, waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

/** Ein Klick, der nicht wirft: was danach noch zu messen ist, ist mehr wert als die Ausnahme. */
const klick = (ziel, grenze = 15000) =>
  ziel
    .click({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

/** Wie oft eine Zelle wiederholt wird, wenn ihr eine Drossel dazwischenkam. */
const VERSUCHE_JE_ZELLE = 3;

/**
 * Eine Ansicht bei einer Breite messen und ihr Bild schreiben. Ein 429 ist
 * kein Rot: hinter Traefik zählen die Drosseln je IP, und die Oberfläche zeigt
 * dann die Anmeldung. Gemerkt, abgewartet, die Zelle noch einmal.
 */
async function ansichtMessen(seite, { name, dateiname, breite, pfad, kennzeichen }) {
  let da = false;
  let gedrosselt = null;
  for (let versuch = 1; versuch <= VERSUCHE_JE_ZELLE && !da; versuch += 1) {
    const vorher = drossel429Stand();
    await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
    konsole = [];
    await laden(seite, pfad);
    da = await steht(seite, kennzeichen, 30000);
    if (da) break;
    gedrosselt = drossel429Seit(vorher);
    if (!gedrosselt) break;
    if (versuch < VERSUCHE_JE_ZELLE) {
      console.log(`nochmal  ${breite.px} px · ${name}: die Drossel „${gedrosselt}" sagte 429`);
      await drosselSchlafen(gedrosselt, drosselNochmalNach(gedrosselt));
    }
  }
  const bild = () =>
    seite.screenshot({ path: path.join(ZIEL, `${breite.px}-${dateiname}.png`) }).catch(() => {});

  if (!da) {
    zelle(
      name,
      breite.px,
      false,
      [`kein ${kennzeichen}`, gedrosselt ? `Drossel „${gedrosselt}" sagte 429` : '']
        .filter(Boolean)
        .join('; ')
    );
    await bild();
    return false;
  }

  // Die Ansicht holt ihre Listen; ohne diese Ruhe zeigt das Bild ein Skelett.
  await seite.waitForTimeout(2000);
  const mass = await seite.evaluate(() => {
    const worte = wurzel => (wurzel?.innerText || '').replace(/\s+/g, ' ').trim().length;
    // Was in einem Rahmen steht, steht auch da: `innerText` endet am iframe,
    // und die App hat unter 900 px die Spalte für sich.
    const inRahmen = [...document.querySelectorAll('iframe')].reduce((summe, rahmen) => {
      try {
        return summe + worte(rahmen.contentDocument?.body);
      } catch {
        return summe;
      }
    }, 0);
    return {
      rollt: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      zeichen: worte(document.body) + inRahmen,
    };
  });
  const eigene = konsole.filter(m => !m.app);
  const fremde = konsole.length - eigene.length;
  const fragen = [
    ['rollt nicht waagerecht', !mass.rollt, `${mass.scrollWidth} gegen ${mass.clientWidth}`],
    ['es steht etwas da', mass.zeichen > 40, `${mass.zeichen} Zeichen`],
    [
      'keine Fehler in der Konsole',
      eigene.length === 0,
      eigene
        .slice(0, 2)
        .map(m => m.text)
        .join(' | '),
    ],
  ];
  const ok = fragen.every(([, gut]) => gut);
  zelle(
    name,
    breite.px,
    ok,
    ok
      ? fremde
        ? `${fremde} Meldung(en) aus der App selbst`
        : ''
      : fragen
          .filter(([, gut]) => !gut)
          .map(([frage, , detail]) => `${frage}: ${detail}`)
          .join('; ')
  );
  await bild();
  return ok;
}

/** Die Leiste: ab 900 px links über die ganze Höhe, darunter unten über die ganze Breite. */
async function leisteMessen(seite, breite, wer) {
  const schmal = breite.px < SCHMAL_AB_PX;
  const kasten = await seite
    .getByTestId('aktivitaetsleiste')
    .first()
    .boundingBox()
    .catch(() => null);
  const fenster = seite.viewportSize();
  const richtig =
    kasten &&
    (schmal
      ? Math.abs(kasten.y + kasten.height - fenster.height) <= 1 &&
        Math.abs(kasten.width - fenster.width) <= 1
      : kasten.x <= 1 && Math.abs(kasten.height - fenster.height) <= 40);
  pruefe(
    `${breite.px} px · ${wer}: die Leiste steht ${schmal ? 'unten' : 'links'}`,
    Boolean(richtig),
    kasten
      ? `x=${Math.round(kasten.x)} y=${Math.round(kasten.y)} ${Math.round(kasten.width)}x${Math.round(kasten.height)}`
      : 'keine Leiste'
  );
}

/**
 * Die Tastatur-Reihenfolge: höchstens N Sprünge mit Tab, und zu jedem Halt die
 * Frage, ob er sichtbar ist und im Dokument NACH dem vorigen steht. Hinter dem
 * letzten Element fängt der Browser vorn an; das ist kein Rücksprung, die
 * Schleife hört dort auf.
 */
async function tabReihenfolge(seite, schritte) {
  const halte = [];
  for (let i = 0; i < schritte; i += 1) {
    await seite.keyboard.press('Tab');
    const halt = await seite.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const kasten = el.getBoundingClientRect();
      const umbruch = window.__erster === el;
      const nachDemVorigen = window.__voriger
        ? Boolean(window.__voriger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        : true;
      window.__voriger = el;
      window.__erster ||= el;
      return {
        name: el.getAttribute('aria-label') || el.id || el.tagName.toLowerCase(),
        sichtbar: kasten.width > 0 && kasten.height > 0,
        nachDemVorigen,
        umbruch,
      };
    });
    if (!halt || halt.umbruch) break;
    halte.push(halt);
  }
  await seite.evaluate(() => {
    delete window.__voriger;
    delete window.__erster;
  });
  return halte;
}

// ---------------------------------------------------------------------------
// Der Durchlauf
// ---------------------------------------------------------------------------

console.log(`=== Oberflächen-Abnahme gegen ${URL}, Probe-App ${APP} ===\n`);

if (!(await geraetErreichbar())) {
  console.log(`Kein Gerät unter ${URL}. Erst: ssh -f -N -L 8443:localhost:443 jetson`);
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });
await seitenladungAbwarten();

const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-oberflaeche-'));
let browser;
let adminToken = '';
let schluessel = '';
let schluesselId = '';
let ausgerollt = false;
let idA = null;

try {
  // --- 0. Vorbereitung: Administrator, Mitarbeiter, Probe-App ----------------
  const an = await anmelden(ADMIN, ADMIN_PASS);
  adminToken = an.token;
  if (!pruefe(`${ADMIN} meldet sich an`, Boolean(adminToken), `HTTP ${an.code}`)) {
    throw new Error('Ohne den Administrator gibt es nichts vorzubereiten.');
  }
  const adminApi = await mitToken(adminToken);

  const benutzer = await adminApi.get('/api/benutzer');
  const liste = benutzer.ok() ? ((await benutzer.json()).data ?? []) : [];
  idA = liste.find(b => b.username === A)?.id ?? null;
  if (!pruefe(`Das Probekonto ${A} ist da, kein neues`, Boolean(idA), `id=${idA}`)) {
    throw new Error(`Ohne ${A} gibt es die Mitarbeiter-Sicht nicht zu messen.`);
  }

  const neu = await adminApi.post('/api/v1/external/api-keys', {
    data: { name: `Abnahme Oberfläche (${STEMPEL})`, allowed_endpoints: ['app:deploy'] },
  });
  const schluesselRumpf = neu.ok() ? await neu.json() : {};
  schluessel = schluesselRumpf.api_key ?? schluesselRumpf.data?.api_key ?? '';
  schluesselId = schluesselRumpf.key_id ?? schluesselRumpf.data?.key_id ?? '';
  if (!pruefe('Wegwerf-Schlüssel mit app:deploy', Boolean(schluessel), `HTTP ${neu.status()}`)) {
    throw new Error('Ohne Schlüssel lässt sich die Probe-App nicht ausrollen.');
  }
  const schluesselApi = await apiKanal({ 'x-api-key': schluessel });
  const paket = paketBauen(arbeit);
  const rollout = await schluesselApi.post('/api/v1/external/apps', {
    multipart: {
      paket: { name: 'paket.tgz', mimeType: 'application/gzip', buffer: fs.readFileSync(paket) },
    },
    timeout: 900000,
  });
  ausgerollt = rollout.status() === 201;
  if (!pruefe(`${APP} in den Teststand`, ausgerollt, `HTTP ${rollout.status()}`)) {
    throw new Error(`Ausrollen: ${einzeilig(await rollout.text().catch(() => ''), 160)}`);
  }
  const live = await schluesselApi.post(`/api/v1/external/apps/${APP}/schalten`, {
    data: { ziel: 'live' },
    timeout: 300000,
  });
  pruefe(`${APP} live geschaltet`, live.status() === 200, `HTTP ${live.status()}`);
  await schluesselApi.dispose();
  const frei = await adminApi.post('/api/freigaben', {
    data: { app_id: APP, benutzer_id: idA, stand: 'live' },
  });
  pruefe(`${APP} ist für ${A} freigegeben`, frei.status() === 201, `HTTP ${frei.status()}`);
  await adminApi.dispose();

  browser = await chromium.launch(chromiumOptionen);

  // =========================================================================
  // Teil 1: der Mitarbeiter
  // =========================================================================
  const ctxM = await fenster(browser);
  const seiteM = await ctxM.newPage();
  await horchen(ctxM, seiteM);

  // --- 1. Die Kopfzeilen des Dokuments, vor jeder Anmeldung ----------------
  const erste = await laden(seiteM, '/');
  const kopf = erste?.headers() ?? {};
  const policy = kopf['content-security-policy'] || kopf['content-security-policy-report-only'];
  pruefe(
    'Das Dokument trägt eine Content-Security-Policy',
    Boolean(policy),
    policy ? `${policy.length} Zeichen` : 'keine'
  );
  pruefe('Die Policy erlaubt kein unsafe-eval', !/unsafe-eval/.test(policy || ''));
  for (const [name, erwartet] of [
    ['strict-transport-security', /max-age=\d+/],
    ['referrer-policy', /strict-origin/],
    ['permissions-policy', /camera=/],
    ['x-content-type-options', /nosniff/],
  ]) {
    pruefe(`Kopfzeile ${name}`, erwartet.test(kopf[name] || ''), kopf[name] || 'fehlt');
  }

  // --- 2. Die Anmeldung, in drei Breiten -----------------------------------
  for (const breite of BREITEN) {
    await ansichtMessen(seiteM, {
      name: 'Anmeldung',
      dateiname: 'anmeldung',
      breite,
      pfad: '/',
      kennzeichen: 'input#username',
    });
  }

  // Erst tippen, dann springen: der Knopf ist gesperrt, solange ein Feld leer
  // ist, und ein gesperrter Knopf nimmt keinen Fokus an.
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await seiteM.locator('input#username').fill(A);
  await seiteM.locator('input#password').fill(A_PASS);
  await seiteM.locator('input#username').focus();
  const haelteAnmeldung = await tabReihenfolge(seiteM, 3);
  pruefe(
    'Anmeldung: Tab führt von der Kennung über das Passwort auf den Knopf',
    haelteAnmeldung[0]?.name === 'password' &&
      haelteAnmeldung[1]?.name === 'button' &&
      haelteAnmeldung.every(h => h.sichtbar && h.nachDemVorigen),
    haelteAnmeldung.map(h => h.name).join(' -> ') || 'kein Halt'
  );

  // --- 3. Die Anmeldung mit der Eingabetaste -------------------------------
  await drosselAbwarten('anmeldung', 1);
  const antwortWartet = seiteM
    .waitForResponse(
      r =>
        r.request().method() === 'POST' &&
        new globalThis.URL(r.url()).pathname === '/api/auth/login',
      { timeout: 60000 }
    )
    .catch(() => null);
  await seiteM.locator('input#password').focus();
  await seiteM.keyboard.press('Enter');
  const antwort = await antwortWartet;
  if (antwort) drosselMerken('POST', '/api/auth/login', antwort.headers(), antwort.status());
  const shellDa = await steht(seiteM, '[data-testid="workspace-shell"]', 60000);
  const wechsel = shellDa ? 0 : await seiteM.locator('[data-testid="passwort-wechseln"]').count();
  pruefe(
    `Anmeldung: die Eingabetaste meldet ${A} an und die Shell steht`,
    shellDa,
    shellDa
      ? ''
      : [
          `HTTP ${antwort?.status() ?? 'keine Antwort'}`,
          wechsel ? 'das Konto verlangt einen Passwortwechsel (Startpasswort)' : '',
          await seiteM
            .locator('#login-error')
            .innerText({ timeout: 2000 })
            .catch(() => ''),
        ]
          .filter(Boolean)
          .join(', ')
  );
  if (!shellDa) {
    await seiteM.screenshot({ path: path.join(ZIEL, '1440-anmeldung-rot.png') }).catch(() => {});
    throw new Error(`Ohne die Shell von ${A} gibt es die Mitarbeiter-Sicht nicht zu messen.`);
  }

  // --- 4. Die Ansichten des Mitarbeiters, in drei Breiten -------------------
  for (const breite of BREITEN) {
    const ok = await ansichtMessen(seiteM, {
      name: 'Startseite',
      dateiname: 'mitarbeiter-startseite',
      breite,
      pfad: '/workspace/dashboard',
      kennzeichen: '[data-testid="uebersicht-seite"]',
    });
    if (ok) {
      await leisteMessen(seiteM, breite, 'Mitarbeiter');
      pruefe(
        `${breite.px} px · Mitarbeiter: die Kachel der Probe-App steht auf der Startseite`,
        await steht(seiteM, `[data-testid="uebersicht-app-${APP}-live"]`, 15000)
      );
    }
  }
  for (const breite of BREITEN) {
    await ansichtMessen(seiteM, {
      name: 'App im Rahmen',
      dateiname: 'app-im-rahmen',
      breite,
      pfad: `/workspace/app/${APP}`,
      kennzeichen: `[data-testid="app-rahmen-${APP}"]`,
    });
  }
  for (const breite of BREITEN) {
    await ansichtMessen(seiteM, {
      name: 'Einstellungen',
      dateiname: 'mitarbeiter-einstellungen',
      breite,
      pfad: '/workspace/settings',
      kennzeichen: '[data-testid="profil-formular"]',
    });
  }

  // --- 5. Die Tastatur durch die Shell --------------------------------------
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await laden(seiteM, '/workspace/dashboard');
  await steht(seiteM, '[data-testid="uebersicht-seite"]', 45000);
  await seiteM.waitForTimeout(1500);
  await seiteM.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const halte = await tabReihenfolge(seiteM, 14);
  const unsichtbar = halte.filter(h => !h.sichtbar);
  const rueckwaerts = halte.filter(h => !h.nachDemVorigen);
  // Ohne diese Zeile wären die beiden darunter bei NULL Halten grün.
  pruefe('Shell: die Tastatur kommt überhaupt hinein', halte.length >= 4, `${halte.length} Halte`);
  pruefe(
    'Shell: der Fokus hält nur auf Sichtbarem',
    unsichtbar.length === 0,
    unsichtbar.map(h => h.name).join(', ') || `${halte.length} Halte`
  );
  pruefe(
    'Shell: die Tab-Reihenfolge folgt dem Dokument',
    rueckwaerts.length === 0,
    rueckwaerts.map(h => h.name).join(', ') ||
      halte
        .map(h => h.name)
        .slice(0, 6)
        .join(' -> ')
  );

  // --- 6. Fehlerzustände des Mitarbeiters -----------------------------------
  // Eine Admin-Adresse: kein Inhalt der Verwaltung, sondern die Startseite oder
  // ein Satz. Das ist Ausblenden; die Berechtigung hält das Backend (403).
  konsole = [];
  await laden(seiteM, '/workspace/verwaltung/benutzer');
  await seiteM.waitForTimeout(3000);
  const verwaltungSichtbar = await seiteM.locator('[data-testid="personen-seite"]').count();
  const abgelenkt =
    (await seiteM.locator('[data-testid="uebersicht-seite"]').count()) +
    (await seiteM.locator('[data-testid="ansicht-nur-admin"]').count());
  pruefe(
    'Mitarbeiter auf einer Admin-Adresse: keine Verwaltung, sondern Startseite oder ein Satz',
    verwaltungSichtbar === 0 && abgelenkt > 0,
    seiteM.url().replace(URL, '')
  );
  const dazu403 = await ctxM.request.get(`${URL}/api/system/info`);
  pruefe(
    'und der Weg dahinter antwortet ihm mit 403',
    dazu403.status() === 403,
    `HTTP ${dazu403.status()}`
  );

  // Eine Adresse, die es nicht gibt: ein Satz und ein Weg zurück. `/dokumente`
  // ist ein Alt-Tab, das Dokumentensystem ist mit B2 gefallen.
  await laden(seiteM, '/dokumente');
  await seiteM.waitForTimeout(2000);
  const vierNullVier = await seiteM.evaluate(() => (document.body.innerText || '').trim());
  pruefe(
    'Eine Adresse, die es nicht gibt: ein Satz statt einer weißen Seite',
    /Diese Adresse gibt es nicht/.test(vierNullVier),
    vierNullVier.split('\n')[0]?.slice(0, 80) || 'nichts'
  );
  await seiteM.screenshot({ path: path.join(ZIEL, '1440-nicht-gefunden.png') }).catch(() => {});

  // --- 7. Abmelden über das Konto-Menü der Fußzeile -------------------------
  await laden(seiteM, '/workspace/dashboard');
  if (await steht(seiteM, '[data-testid="workspace-shell"]', 45000)) {
    const menue =
      (await klick(seiteM.getByTestId('workspace-benutzermenue').first())) &&
      (await steht(seiteM, '[data-testid="workspace-abmelden"]', 15000));
    pruefe('Das Konto-Menü der Fußzeile geht auf', menue);
    if (menue) {
      await seiteM.screenshot({ path: path.join(ZIEL, '1440-konto-menue.png') }).catch(() => {});
      pruefe(
        'Abmelden führt zurück auf die Anmeldung',
        (await klick(seiteM.getByTestId('workspace-abmelden').first())) &&
          (await steht(seiteM, 'input#username', 30000))
      );
    }
  } else {
    pruefe('Die Shell steht für das Abmelden', false, 'keine Shell');
  }

  // --- 8. Das Backend weg ---------------------------------------------------
  // Jede Anfrage dahin wird abgewürgt; die Oberfläche soll sagen, was los ist.
  // Der Anmeldeversuch erreicht das Gerät nicht und kostet keine Drossel.
  await seiteM.route('**/api/**', route => route.abort());
  await seiteM.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await seiteM.waitForTimeout(3000);
  const ohneBackend = await seiteM.evaluate(() => (document.body.innerText || '').trim());
  pruefe(
    'Backend weg: die Seite zeichnet weiter, statt weiß zu bleiben',
    ohneBackend.length > 40,
    `${ohneBackend.length} Zeichen`
  );
  if (await steht(seiteM, 'input#username', 20000)) {
    await seiteM.locator('input#username').fill(A);
    await seiteM.locator('input#password').fill('kein-echtes-passwort');
    await seiteM.locator('button[type="submit"]').click();
    const meldung = await seiteM
      .locator('#login-error')
      .innerText({ timeout: 20000 })
      .catch(() => '');
    pruefe(
      'Backend weg: der Anmeldeversuch nennt den Grund',
      /Verbindung/i.test(meldung),
      einzeilig(meldung, 80) || 'keine Meldung'
    );
  } else {
    pruefe('Backend weg: die Anmeldung steht', false, 'kein Anmeldefeld');
  }
  await seiteM.screenshot({ path: path.join(ZIEL, '1440-backend-weg.png') }).catch(() => {});
  await seiteM.unroute('**/api/**');
  await ctxM.close();

  // =========================================================================
  // Teil 2: der Administrator, mit dem Token von oben
  // =========================================================================
  const ctxA = await fenster(browser, adminToken);
  const seiteA = await ctxA.newPage();
  await horchen(ctxA, seiteA);

  for (const breite of BREITEN) {
    const ok = await ansichtMessen(seiteA, {
      name: 'Startseite (Admin)',
      dateiname: 'admin-startseite',
      breite,
      pfad: '/workspace/dashboard',
      kennzeichen: '[data-testid="uebersicht-seite"]',
    });
    if (ok) await leisteMessen(seiteA, breite, 'Administrator');
  }
  for (const [name, dateiname, pfad, kennzeichen] of VERWALTUNG) {
    for (const breite of BREITEN) {
      await ansichtMessen(seiteA, { name, dateiname, breite, pfad, kennzeichen });
    }
  }

  // --- Escape schließt einen Dialog -----------------------------------------
  await seiteA.setViewportSize({ width: 1440, height: 900 });
  await laden(seiteA, '/workspace/verwaltung/benutzer');
  await steht(seiteA, '[data-testid="personen-seite"]', 30000);
  const dialogDa =
    (await klick(seiteA.getByTestId('person-anlegen-oeffnen').first())) &&
    (await steht(seiteA, '#neu-vorname', 20000));
  pruefe('Der Dialog „Person anlegen" geht auf', dialogDa);
  if (dialogDa) {
    await seiteA.keyboard.press('Escape');
    pruefe(
      'Escape schließt ihn wieder, ohne etwas anzulegen',
      await seiteA
        .locator('#neu-vorname')
        .waitFor({ state: 'detached', timeout: 15000 })
        .then(() => true)
        .catch(() => false)
    );
  }

  // --- Das Urteil über die CSP, über beide Rollen und den ganzen Durchlauf ---
  const unerwartet = cspVerstoesse.filter(v => !bekannteEvalProbe(v));
  pruefe(
    'Kein unerwarteter CSP-Verstoß im ganzen Durchlauf',
    unerwartet.length === 0,
    `${unerwartet.length} unerwartet, ${cspVerstoesse.length - unerwartet.length} bekannte eval-Probe`
  );
  const gesehen = new Set();
  for (const v of unerwartet) {
    const zeile = `${v.richtlinie || 'unbekannt'}  ${v.quelle}  ${v.blockiert || ''}  ${v.datei ? `${v.datei}:${v.zeile}` : ''}  ${v.text || ''}`;
    if (!gesehen.has(zeile)) console.log(`  ${zeile}`);
    gesehen.add(zeile);
  }
  await ctxA.close();
} catch (fehler) {
  pruefe('Der Durchlauf kommt bis zum Ende', false, einzeilig(fehler.message, 240));
} finally {
  // --- Aufräumen, auch nach einem roten Lauf ---------------------------------
  await browser?.close();
  if (adminToken) {
    const aApi = await mitToken(adminToken);
    if (idA) await aApi.delete(`/api/freigaben/${APP}/${idA}`).catch(() => null);
    if (ausgerollt && schluessel) {
      const sApi = await apiKanal({ 'x-api-key': schluessel });
      const weg = await sApi
        .delete(`/api/v1/external/apps/${APP}?bestaetigung=${APP}&dateien=true`, {
          timeout: 300000,
        })
        .catch(() => null);
      console.log(`aufgeraeumt  ${APP} entfernt (HTTP ${weg?.status() ?? '-'})`);
      await sApi.dispose();
    }
    if (schluesselId) {
      const weg = await aApi.delete(`/api/v1/external/api-keys/${schluesselId}`).catch(() => null);
      console.log(`aufgeraeumt  Schlüssel widerrufen (HTTP ${weg?.status() ?? '-'})`);
    }
    if (ausgerollt) {
      const nachher = await aApi.get(`/api/apps/${APP}`).catch(() => null);
      pruefe(`${APP} ist wieder weg (404)`, nachher?.status() === 404, `HTTP ${nachher?.status()}`);
    }
    await aApi.post('/api/auth/logout').catch(() => null);
    await aApi.dispose();
  }
  fs.rmSync(arbeit, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Die Tabelle
// ---------------------------------------------------------------------------

console.log('\n  Ansicht                        390    1024   1440');
console.log('  ' + '-'.repeat(52));
for (const [ansicht, breiten] of tabelle) {
  const felder = BREITEN.map(b => {
    const wert = breiten.get(b.px);
    return wert === undefined ? '  -   ' : wert ? 'gruen ' : 'ROT   ';
  });
  console.log(`  ${ansicht.padEnd(30)} ${felder.join(' ')}`);
}
const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen, ${drosselBilanz()}`);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
