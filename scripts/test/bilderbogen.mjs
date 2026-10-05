/**
 * Der Bilderbogen: jede Ansicht der Shell, beide Themes, drei Breiten.
 * Phase H5 des Plans vom 29.08.2026.
 *
 * WOZU ES IHN GIBT, UND WARUM ER NICHT DIE REIHE IST
 *
 * `oberflaeche-abnahme.mjs` ist ein MESSGERAET: es stellt je Zelle vier
 * Fragen (steht die Ansicht da, rollt sie, steht etwas darin, schweigt die
 * Konsole) und gibt am Ende gruen oder rot. Diese Datei ist eine KAMERA. Sie
 * fragt nichts ausser „ist die Ansicht ueberhaupt da" und schreibt Bilder,
 * die ein Mensch nebeneinanderlegt: derselbe Ordner einmal VOR und einmal
 * NACH einem Umbau der Oberflaeche.
 *
 * Das ist kein zweites Messgeraet und keine zweite Wahrheit ueber die
 * Oberflaeche. Was die Reihe misst, misst weiter nur die Reihe; die drei
 * Breiten und die Liste der Verwaltungsansichten stehen deshalb in
 * `ansichten.mjs` und werden von beiden gelesen. Was hier dazukommt und dort
 * mit Absicht fehlt, ist das THEME: die Reihe misst die Oberflaeche in dem
 * Theme, das der Mensch eingestellt hat, und sie zweimal zu fahren hiesse,
 * ihre Anmeldungen und ihre Laufzeit zu verdoppeln, um Bilder zu bekommen.
 *
 * WAS FOTOGRAFIERT WIRD
 *
 *   - die Anmeldung (ohne Sitzung)
 *   - die Startseite und eine App im Rahmen
 *   - die acht Bereiche der Verwaltung (`ansichten.mjs`)
 *   - eine App im Einzelnen (Stände, Tester, Flows, Läufe)
 *   - die Schauseite der Bibliothek
 *
 * je zweimal (hell, dunkel) und je dreimal (390, 1024, 1440 px).
 *
 * NEU GESCHNITTEN AM 05.10.2026 (M5), wie `oberflaeche-abnahme.mjs`. Vorher
 * legte der Bogen einen Wegwerf-Mitarbeiter über eine Schnittstelle an, die es
 * so nicht mehr gibt, fotografierte Notizen und Hamburger-Menü, die mit dem
 * Handy-Auftrag vom 04.10.2026 gefallen sind, nahm die erste App mit Livestand
 * und konnte sich mit dem Konto `admin` anmelden. Seither:
 *
 *   - Das Konto nur aus der Umgebung und nur ein vorhandenes Probekonto
 *     (probe-admin). Kein Konto wird angelegt, nie `admin`. Der
 *     Startpasswort-Wechsel ist deshalb nicht mehr dabei: er bräuchte ein
 *     Konto, dessen Passwort der Administrator setzt.
 *   - Fotografiert wird eine eigene Probe-App mit Stempel,
 *     `probe-bilderbogen-<STEMPEL>` aus `tests/probe-leiste`. Der Bogen rollt
 *     sie über einen Wegwerf-Schlüssel aus, schaltet sie live, gibt sie dem
 *     Probekonto frei und entfernt am Ende alles wieder, auch nach einem
 *     Fehler. An einer anderen App fotografiert er nie.
 *   - Das Theme des Probekontos steht am Ende wieder so, wie es war.
 *
 * DIE ANMELDESEITE HAT KEIN THEME. Das Theme gehört einem Menschen (H1), und
 * vor der ersten eigenen Entscheidung steht die Vorgabe. Ihr dunkles Bild
 * entsteht deshalb mit AUFGEZWUNGENEM Attribut -- es beantwortet die andere
 * Frage, ob die Seite in beiden Themes überhaupt lesbar ist. Dieselbe Regel
 * wie in `theme-abnahme.mjs`, und im `BILDER.md` steht sie dabei.
 *
 * VORAUSSETZUNG: `playwright` steht in keinem Lockfile dieses Repos:
 * `npm i --no-save playwright` im Wurzelordner ODER
 * ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>; Chromium über
 * `npx playwright install chromium` oder ARASUL_CHROMIUM=<Datei>.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   node scripts/test/bilderbogen.mjs --stand vorher
 *   (… --stand nachher; `--nur uebersicht,verwaltung-geraet` fotografiert nur diese)
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-bilderbogen-<stand>/`,
 * dazu ein `BILDER.md`, das sie als Tabelle Ansicht mal Theme mal Breite
 * aufführt. Passwörter nur aus der Umgebung, nie in eine Datei.
 *
 * Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_STEMPEL,
 * ARASUL_TAG, ARASUL_CHROMIUM.
 *
 * Rückgabe 0, wenn jede Ansicht dastand, sonst 1; 2, wenn das Konto fehlt.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  drosselAbwarten,
  drosselBilanz,
  drosselMerken,
  drosselNochmalNach,
  drosselSchlafen,
  seitenladungAbwarten,
} from './drossel.mjs';
import { BREITEN, VERWALTUNG } from './ansichten.mjs';
import { zugangAusUmgebung } from './anmeldung.mjs';

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
const { benutzer: BENUTZER, passwort: PASSWORT } = zugangAusUmgebung();
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const gastgeber = new globalThis.URL(URL).hostname;

const standIndex = process.argv.indexOf('--stand');
const STAND = standIndex > -1 ? process.argv[standIndex + 1] : 'vorher';
/** `--nur uebersicht,verwaltung-geraet` fotografiert nur diese Dateinamen (Nacharbeit). */
const nurIndex = process.argv.indexOf('--nur');
const NUR = nurIndex > -1 ? (process.argv[nurIndex + 1] || '').split(',').filter(Boolean) : [];
const gefragt = dateiname => NUR.length === 0 || NUR.includes(dateiname);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-bilderbogen-${STAND}`);

const STEMPEL = process.env.ARASUL_STEMPEL || String(Date.now());
/**
 * Die Probe-App dieses Laufs. Die Kennung ist kein Parameter: an einer echten
 * App des Geräts fotografiert dieser Bogen nie.
 */
const APP = `probe-bilderbogen-${STEMPEL}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const QUELLE = path.join(WURZEL, 'tests/probe-leiste');
const chromiumOptionen = {
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
};

/**
 * Die zwei Themes. `attribut` ist, was am `<html>` steht: im Hellen NICHTS,
 * denn Hell braucht seit H1 keinen Selektor.
 */
const THEMES = [
  { name: 'hell', wert: 'light', attribut: null, flaeche: 'rgb(246, 246, 246)' },
  { name: 'dunkel', wert: 'dark', attribut: 'dark', flaeche: 'rgb(20, 20, 20)' },
];

const bilder = [];
const fehlend = [];

function einzeilig(text, laenge = 160) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, laenge);
}

// ---------------------------------------------------------------------------
// Wege zum Geraet
// ---------------------------------------------------------------------------

async function apiKanal(token) {
  return pwRequest.newContext({
    baseURL: URL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: token ? { authorization: `Bearer ${token}` } : {},
  });
}

let anmeldungen = 0;

async function anmelden(benutzer, passwort) {
  await drosselAbwarten('anmeldung', 1);
  const kanal = await pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
  try {
    anmeldungen += 1;
    const antwort = await kanal.post('/api/auth/login', {
      data: { username: benutzer, password: passwort },
    });
    drosselMerken('POST', '/api/auth/login', antwort.headers(), antwort.status());
    if (antwort.status() === 200) return { token: (await antwort.json()).token ?? '', code: 200 };
    if (antwort.status() === 429) {
      await drosselSchlafen('anmeldung', drosselNochmalNach('anmeldung'));
      const zweite = await kanal.post('/api/auth/login', {
        data: { username: benutzer, password: passwort },
      });
      drosselMerken('POST', '/api/auth/login', zweite.headers(), zweite.status());
      if (zweite.status() === 200) return { token: (await zweite.json()).token ?? '', code: 200 };
      return { token: '', code: zweite.status() };
    }
    return { token: '', code: antwort.status() };
  } finally {
    await kanal.dispose();
  }
}

async function adminToken() {
  return (await anmelden(BENUTZER, PASSWORT)).token;
}

/** Das Paket der Probe-App: `tests/probe-leiste` mit eigener Kennung und eigenem Namen. */
function paketBauen(arbeit) {
  const ordner = path.join(arbeit, 'paket');
  fs.mkdirSync(ordner, { recursive: true });
  fs.cpSync(path.join(QUELLE, 'frontend'), path.join(ordner, 'frontend'), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(QUELLE, 'app.json'), 'utf-8'));
  manifest.id = APP;
  manifest.name = `Probe Bilderbogen ${STEMPEL}`;
  manifest.beschreibung = 'Kamera für scripts/test/bilderbogen.mjs, wird am Ende entfernt.';
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(manifest, null, 2));
  const datei = path.join(arbeit, 'paket.tgz');
  execFileSync('tar', ['czf', datei, '-C', ordner, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  return datei;
}

async function fensterMitToken(browser, token) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
  });
  // Der Einrichtungs-Hinweis verdeckte sonst die erste Ansicht.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* Speicher gesperrt, stört nur die Sicht */
    }
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

async function steht(seite, waehler, grenze = 30000) {
  return seite
    .locator(waehler)
    .first()
    .waitFor({ state: 'visible', timeout: grenze })
    .then(() => true)
    .catch(() => false);
}

/**
 * Warten, bis die Flaeche wirklich die des Themes ist.
 *
 * `body` traegt `transition: background-color` (0,3 s), und ein Bild aus der
 * Mitte des Uebergangs zeigt eine Farbe, die es nicht gibt. Derselbe Grund
 * wie in `theme-abnahme.mjs`; abgeschaltet wird der Uebergang nicht.
 */
async function flaecheSteht(seite, erwartet, grenze = 4000) {
  const bis = Date.now() + grenze;
  for (;;) {
    const ist = await seite
      .evaluate(() => globalThis.getComputedStyle(document.body).backgroundColor)
      .catch(() => '');
    if (ist === erwartet || Date.now() > bis) return ist;
    await seite.waitForTimeout(120);
  }
}

// ---------------------------------------------------------------------------
// Ein Bild
// ---------------------------------------------------------------------------

/**
 * Eine Ansicht in einem Theme bei einer Breite fotografieren.
 *
 * Gefragt wird nur, ob die Ansicht dasteht -- ist sie es nicht, entsteht das
 * Bild trotzdem, denn ein Bild von dem, was statt dessen dasteht, ist die
 * brauchbarere Auskunft als eine Zeile „nicht da".
 */
async function schuss(seite, { name, dateiname, theme, breite, oeffnen, kennzeichen }) {
  await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
  await oeffnen();
  const da = await steht(seite, kennzeichen, 30000);
  // Die Ansicht holt ihre Listen; ohne diese Ruhe zeigt das Bild ein Skelett.
  await seite.waitForTimeout(1500);
  const flaeche = await flaecheSteht(seite, theme.flaeche);
  const datei = `${dateiname}-${theme.name}-${breite.px}.png`;
  await seite.screenshot({ path: path.join(ZIEL, datei), fullPage: false }).catch(() => {});
  bilder.push({ name, dateiname, theme: theme.name, breite: breite.px, datei, da, flaeche });
  if (!da) fehlend.push(`${name} · ${theme.name} · ${breite.px} px (kein ${kennzeichen})`);
  console.log(
    `${da ? 'Bild ' : 'LEER '} ${name} · ${theme.name} · ${breite.px} px` +
      (flaeche === theme.flaeche ? '' : `  (Flaeche ${flaeche}, erwartet ${theme.flaeche})`)
  );
  return da;
}

/** Eine Ansicht in beiden Themes und allen drei Breiten. */
async function bogen(seite, themaSetzen, { name, dateiname, oeffnen, kennzeichen }) {
  if (!gefragt(dateiname)) return;
  for (const theme of THEMES) {
    await themaSetzen(theme);
    for (const breite of BREITEN) {
      await schuss(seite, { name, dateiname, theme, breite, oeffnen, kennzeichen });
    }
  }
}

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(ZIEL, { recursive: true });
  const token = await adminToken();
  if (!token) {
    console.error(`Keine Anmeldung für ${BENUTZER} -- der Bogen bleibt leer.`);
    return 1;
  }
  const kanal = await apiKanal(token);
  const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-bilderbogen-'));
  const browser = await chromium.launch(chromiumOptionen);

  // Das Theme des Probekontos steht am Ende wieder so, wie es war, auch wenn
  // unterwegs etwas schiefging -- sonst fände der nächste Lauf ein Konto, das
  // dieser umgestellt hat.
  const ich = await kanal
    .get('/api/auth/me')
    .then(a => (a.status() === 200 ? a.json() : null))
    .catch(() => null);
  const meineId = ich?.user?.id ?? null;
  const themaVorher = ich?.user?.theme === 'dark' ? 'dark' : 'light';
  const themaZurueck = async () => {
    await kanal.put('/api/darstellung', { data: { theme: themaVorher } }).catch(() => {});
  };

  let schluessel = '';
  let schluesselId = '';
  let ausgerollt = false;
  let freigegeben = false;

  try {
    // --- Die Anmeldung, ohne Sitzung -------------------------------------
    if (gefragt('anmeldung')) {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const seite = await ctx.newPage();
      for (const theme of THEMES) {
        for (const breite of BREITEN) {
          await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
          await laden(seite, URL);
          await steht(seite, 'input#username', 30000);
          // Das Attribut von Hand: die Anmeldeseite kennt keinen Menschen und
          // damit kein Theme. Das dunkle Bild beantwortet die Frage, ob sie in
          // beiden ueberhaupt lesbar ist.
          await seite.evaluate(wert => {
            if (wert) document.documentElement.setAttribute('data-theme', wert);
            else document.documentElement.removeAttribute('data-theme');
          }, theme.attribut);
          await seite.waitForTimeout(600);
          const flaeche = await flaecheSteht(seite, theme.flaeche);
          const datei = `anmeldung-${theme.name}-${breite.px}.png`;
          await seite.screenshot({ path: path.join(ZIEL, datei) }).catch(() => {});
          bilder.push({
            name: 'Anmeldung',
            dateiname: 'anmeldung',
            theme: theme.name,
            breite: breite.px,
            datei,
            da: true,
            flaeche,
            hinweis: 'Theme aufgezwungen: die Anmeldeseite kennt keinen Menschen',
          });
          console.log(`Bild  Anmeldung · ${theme.name} · ${breite.px} px`);
        }
      }
      await ctx.close();
    }

    // --- Die Probe-App: ausrollen, live schalten, dem Probekonto freigeben ---
    const neu = await kanal.post('/api/v1/external/api-keys', {
      data: { name: `Bilderbogen (${STEMPEL})`, allowed_endpoints: ['app:deploy'] },
    });
    const rumpf = neu.ok() ? await neu.json() : {};
    schluessel = rumpf.api_key ?? rumpf.data?.api_key ?? '';
    schluesselId = rumpf.key_id ?? rumpf.data?.key_id ?? '';
    if (!schluessel) {
      fehlend.push(`Probe-App: kein Wegwerf-Schlüssel (HTTP ${neu.status()})`);
    } else {
      const schluesselApi = await pwRequest.newContext({
        baseURL: URL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: { 'x-api-key': schluessel },
      });
      const rollout = await schluesselApi.post('/api/v1/external/apps', {
        multipart: {
          paket: {
            name: 'paket.tgz',
            mimeType: 'application/gzip',
            buffer: fs.readFileSync(paketBauen(arbeit)),
          },
        },
        timeout: 900000,
      });
      ausgerollt = rollout.status() === 201;
      if (!ausgerollt) fehlend.push(`Probe-App ${APP}: Ausrollen HTTP ${rollout.status()}`);
      if (ausgerollt) {
        const live = await schluesselApi.post(`/api/v1/external/apps/${APP}/schalten`, {
          data: { ziel: 'live' },
          timeout: 300000,
        });
        if (live.status() !== 200) fehlend.push(`Probe-App ${APP}: live HTTP ${live.status()}`);
      }
      await schluesselApi.dispose();
    }
    if (ausgerollt && meineId != null) {
      const frei = await kanal.post('/api/freigaben', {
        data: { app_id: APP, benutzer_id: meineId, stand: 'live' },
      });
      freigegeben = frei.status() === 201;
      if (!freigegeben) fehlend.push(`Probe-App ${APP}: Freigabe HTTP ${frei.status()}`);
    }

    // --- Die Shell, als Administrator --------------------------------------
    const ctx = await fensterMitToken(browser, token);
    const seite = await ctx.newPage();

    /** Das Theme des Menschen umstellen -- über den Weg, den die Shell geht. */
    const themaSetzen = async theme => {
      const antwort = await kanal.put('/api/darstellung', { data: { theme: theme.wert } });
      if (antwort.status() !== 200) {
        console.log(`  (PUT /api/darstellung ${theme.wert} → HTTP ${antwort.status()})`);
      }
    };

    const ANSICHTEN = [
      {
        name: 'Startseite',
        dateiname: 'startseite',
        kennzeichen: '[data-testid="uebersicht-seite"]',
        oeffnen: () => laden(seite, `${URL}/workspace/dashboard`),
      },
      ...(ausgerollt
        ? [
            {
              name: 'App im Rahmen',
              dateiname: 'app-rahmen',
              kennzeichen: `[data-testid="app-rahmen-${APP}"]`,
              oeffnen: () => laden(seite, `${URL}/workspace/app/${APP}`),
            },
          ]
        : []),
      ...VERWALTUNG.map(([name, dateiname, pfad, kennzeichen]) => ({
        name,
        dateiname,
        kennzeichen,
        oeffnen: () => laden(seite, `${URL}${pfad}`),
      })),
      {
        name: 'Schauseite der Bibliothek',
        dateiname: 'schauseite',
        kennzeichen: '[data-schaustueck="Button"]',
        oeffnen: () => laden(seite, `${URL}/entwickler/bausteine`),
      },
    ];

    for (const ansicht of ANSICHTEN) {
      await bogen(seite, themaSetzen, ansicht);
    }

    // --- Eine App im Einzelnen (Stände, Tester, Flows, Läufe) ----------------
    // DAS KENNZEICHEN IST DIE EINZELANSICHT UND NICHT DIE LISTE: ein
    // Kennzeichen, das beim Misserfolg dasteht und beim Erfolg nicht, misst
    // das Gegenteil (erster Lauf am Orin, 29.08.2026).
    if (ausgerollt) {
      await bogen(seite, themaSetzen, {
        name: 'App im Einzelnen',
        dateiname: 'app-einzeln',
        kennzeichen: `[data-testid="app-ansicht-${APP}"]`,
        oeffnen: async () => {
          await laden(seite, `${URL}/workspace/verwaltung/apps`);
          await steht(seite, '[data-testid="apps-seite"]', 30000);
          await seite
            .locator(`[data-testid="app-oeffnen-${APP}"]`)
            .first()
            .click({ timeout: 15000 })
            .catch(() => {});
          await seite.waitForTimeout(1000);
        },
      });
    }

    await ctx.close();
  } finally {
    // --- Aufräumen, auch nach einem Fehler -----------------------------------
    await themaZurueck();
    await browser.close();
    if (freigegeben && meineId != null) {
      await kanal.delete(`/api/freigaben/${APP}/${meineId}`).catch(() => null);
    }
    if (ausgerollt && schluessel) {
      const sApi = await pwRequest.newContext({
        baseURL: URL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: { 'x-api-key': schluessel },
      });
      const weg = await sApi
        .delete(`/api/v1/external/apps/${APP}?bestaetigung=${APP}&dateien=true`, {
          timeout: 300000,
        })
        .catch(() => null);
      console.log(`aufgeräumt  ${APP} entfernt (HTTP ${weg?.status() ?? '-'})`);
      await sApi.dispose();
    }
    if (schluesselId) {
      const weg = await kanal.delete(`/api/v1/external/api-keys/${schluesselId}`).catch(() => null);
      console.log(`aufgeräumt  Schlüssel widerrufen (HTTP ${weg?.status() ?? '-'})`);
    }
    await kanal.post('/api/auth/logout').catch(() => null);
    await kanal.dispose();
    fs.rmSync(arbeit, { recursive: true, force: true });
  }

  // --- Das Verzeichnis der Bilder ------------------------------------------
  const ansichten = [...new Set(bilder.map(b => b.name))];
  const zeilen = [
    `# Bilderbogen ${STAND} — ${TAG}`,
    '',
    `${bilder.length} Bilder, ${ansichten.length} Ansichten mal zwei Themes mal drei Breiten.`,
    '',
    'Die Anmeldung trägt ihr Theme AUFGEZWUNGEN:',
    'das Theme gehoert einem Menschen (H1), und vor der ersten eigenen',
    'Entscheidung steht die Vorgabe. Ihr dunkles Bild beantwortet die andere',
    'Frage — ob die Seite in beiden Themes ueberhaupt lesbar ist.',
    '',
    '| Ansicht | Theme | 390 | 1024 | 1440 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const name of ansichten) {
    for (const theme of THEMES) {
      const je = breite =>
        bilder.find(b => b.name === name && b.theme === theme.name && b.breite === breite);
      const zelle = b => (b ? `[Bild](${b.datei})${b.da ? '' : ' ⚠ leer'}` : '—');
      zeilen.push(
        `| ${name} | ${theme.name} | ${zelle(je(390))} | ${zelle(je(1024))} | ${zelle(je(1440))} |`
      );
    }
  }
  if (fehlend.length) {
    zeilen.push('', '## Ansichten, die nicht dastanden', '');
    for (const f of fehlend) zeilen.push(`- ${f}`);
  }
  fs.writeFileSync(path.join(ZIEL, 'BILDER.md'), zeilen.join('\n') + '\n');

  console.log('');
  console.log(`${bilder.length} Bilder in ${path.relative(WURZEL, ZIEL)}`);
  console.log(`${anmeldungen} Anmeldung(en). ${drosselBilanz()}`);
  if (fehlend.length) {
    console.log(`${fehlend.length} Ansicht(en) standen nicht da:`);
    for (const f of fehlend) console.log(`  ${f}`);
    return 1;
  }
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(fehler => {
    console.error(`Bilderbogen abgebrochen: ${einzeilig(fehler?.stack || fehler?.message)}`);
    process.exit(1);
  });
