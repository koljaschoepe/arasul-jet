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
 *   - der Startpasswort-Wechsel (ein Wegwerf-Mitarbeiter, EINE Anmeldung)
 *   - die Uebersicht, die Notizen, eine App im Rahmen
 *   - die acht Einstellungs-Sektionen und die fuenf System-Unterseiten
 *   - die Modelle
 *   - eine App im Einzelnen (Staende, Tester, Flows, Laeufe)
 *   - die Schauseite der Bibliothek
 *
 * je zweimal (hell, dunkel) und je dreimal (390, 1024, 1440 px).
 *
 * DIE ANMELDESEITE HAT KEIN THEME, und der Startpasswort-Wechsel auch nicht:
 * das Theme gehoert einem Menschen (H1), und vor der ersten eigenen
 * Entscheidung steht die Vorgabe. Ihr dunkles Bild entsteht deshalb mit
 * AUFGEZWUNGENEM Attribut -- es beantwortet die andere Frage, ob die Seite in
 * beiden Themes ueberhaupt lesbar ist. Dieselbe Regel wie in
 * `theme-abnahme.mjs`, und im `BILDER.md` steht sie dabei.
 *
 * KOSTET EINE ANMELDUNG. Der Administrator kommt ueber `$ARASUL_TOKEN` oder
 * die abgelegte Datei; die eine gehoert dem Wegwerf-Mitarbeiter, dessen
 * Startpasswort-Schirm sonst nicht zu fotografieren waere. Ohne einen
 * gueltigen Token kostet er eine zweite.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_PASSWORT=... node scripts/test/bilderbogen.mjs --stand vorher
 *   ARASUL_PASSWORT=... node scripts/test/bilderbogen.mjs --stand nachher
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-h5-<stand>/`, dazu ein
 * `BILDER.md`, das sie als Tabelle Ansicht mal Theme mal Breite auffuehrt.
 *
 * Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TOKEN,
 * ARASUL_TOKEN_DATEI, ARASUL_TAG, ARASUL_APP.
 *
 * Rueckgabe 0, wenn jede Ansicht dastand, sonst 1.
 */

import fs from 'node:fs';
import os from 'node:os';
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
import { BREITEN, VERWALTUNG } from './ansichten.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const TOKEN_DATEI =
  process.env.ARASUL_TOKEN_DATEI || path.join(os.tmpdir(), 'arasul-abnahme-token');
const gastgeber = new globalThis.URL(URL).hostname;

const standIndex = process.argv.indexOf('--stand');
const STAND = standIndex > -1 ? process.argv[standIndex + 1] : 'vorher';
/** `--nur uebersicht,notizen` fotografiert nur diese Dateinamen (Nacharbeit). */
const nurIndex = process.argv.indexOf('--nur');
const NUR = nurIndex > -1 ? (process.argv[nurIndex + 1] || '').split(',').filter(Boolean) : [];
const gefragt = dateiname => NUR.length === 0 || NUR.includes(dateiname);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-h5-${STAND}`);

const STEMPEL = Date.now();
const MITARB = `bilderbogen-${STEMPEL}`;
const PASS_START = `Start-${STEMPEL}`;

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

async function tokenGilt(token) {
  if (!token) return false;
  const kanal = await apiKanal(token);
  try {
    return (await kanal.get('/api/auth/me')).status() === 200;
  } catch {
    return false;
  } finally {
    await kanal.dispose();
  }
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
  if (process.env.ARASUL_TOKEN) return process.env.ARASUL_TOKEN;
  const abgelegt = fs.existsSync(TOKEN_DATEI) ? fs.readFileSync(TOKEN_DATEI, 'utf-8').trim() : '';
  if (await tokenGilt(abgelegt)) return abgelegt;
  const { token } = await anmelden(BENUTZER, PASSWORT);
  if (token) fs.writeFileSync(TOKEN_DATEI, token, { mode: 0o600 });
  return token;
}

async function fensterMitToken(browser, token) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
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
 * Wegraeumen, was im schmalen Aufbau obenauf liegt -- dieselbe Sache wie in
 * der Reihe. Ohne das zeigt jedes Bild unter 900 px die Notizen oder das
 * Menue statt der Ansicht.
 */
async function wegRaeumen(seite) {
  const schmal = await seite
    .locator("[data-testid='workspace-shell'][data-shell-aufbau='schmal']")
    .count()
    .catch(() => 0);
  if (!schmal) return;
  if (
    await seite
      .locator("[data-testid='workspace-schmal-menue']")
      .count()
      .catch(() => 0)
  ) {
    await seite
      .locator('[aria-label="Menü schließen"]')
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  }
  if (
    await seite
      .locator("[data-panel]#right[data-shell-hidden='false']")
      .count()
      .catch(() => 0)
  ) {
    await seite
      .locator('[aria-label="Notizen ausblenden"]')
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  }
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
async function schuss(
  seite,
  { name, dateiname, theme, breite, oeffnen, kennzeichen, notizenLassen = false }
) {
  await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
  await oeffnen();
  if (!notizenLassen) await wegRaeumen(seite);
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
async function bogen(
  seite,
  themaSetzen,
  { name, dateiname, oeffnen, kennzeichen, notizenLassen = false }
) {
  if (!gefragt(dateiname)) return;
  for (const theme of THEMES) {
    await themaSetzen(theme);
    for (const breite of BREITEN) {
      await schuss(seite, { name, dateiname, theme, breite, oeffnen, kennzeichen, notizenLassen });
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
    console.error('Kein Token fuer den Administrator -- der Bogen bleibt leer.');
    return 1;
  }
  const kanal = await apiKanal(token);
  const browser = await chromium.launch();

  // Das Theme des Administrators steht am Ende wieder auf hell, auch wenn
  // unterwegs etwas schiefging -- sonst faende der naechste Lauf ein Geraet,
  // das dieser umgestellt hat.
  const themaZurueck = async () => {
    await kanal.put('/api/darstellung', { data: { theme: 'light' } }).catch(() => {});
  };

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

    // --- Der Startpasswort-Wechsel ----------------------------------------
    // Ein Wegwerf-Mitarbeiter, dessen Passwort der Administrator gesetzt hat.
    // Kostet die eine Anmeldung des Laufs.
    let angelegt = null;
    if (gefragt('startpasswort')) {
      // `rolle`, nicht `role`: `CreateBenutzerBody` ist `.strict()`, und der
      // englische Name kostete die D5-Abnahme einen Lauf.
      const antwort = await kanal.post('/api/benutzer', {
        data: {
          username: MITARB,
          email: `${MITARB}@bilderbogen.local`,
          password: PASS_START,
          rolle: 'mitarbeiter',
        },
      });
      if (antwort.status() === 201) {
        angelegt = (await antwort.json())?.data?.id ?? null;
        const { token: mitarbToken, code } = await anmelden(MITARB, PASS_START);
        if (mitarbToken) {
          const ctx = await fensterMitToken(browser, mitarbToken);
          const seite = await ctx.newPage();
          for (const theme of THEMES) {
            for (const breite of BREITEN) {
              await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
              await laden(seite, `${URL}/workspace`);
              const da = await steht(seite, '[data-testid="passwort-wechseln"]', 30000);
              await seite.evaluate(wert => {
                if (wert) document.documentElement.setAttribute('data-theme', wert);
                else document.documentElement.removeAttribute('data-theme');
              }, theme.attribut);
              await seite.waitForTimeout(600);
              const flaeche = await flaecheSteht(seite, theme.flaeche);
              const datei = `startpasswort-${theme.name}-${breite.px}.png`;
              await seite.screenshot({ path: path.join(ZIEL, datei) }).catch(() => {});
              bilder.push({
                name: 'Startpasswort',
                dateiname: 'startpasswort',
                theme: theme.name,
                breite: breite.px,
                datei,
                da,
                flaeche,
                hinweis: 'Theme aufgezwungen: der Mensch hat noch keines gewaehlt',
              });
              console.log(
                `${da ? 'Bild ' : 'LEER '} Startpasswort · ${theme.name} · ${breite.px} px`
              );
              if (!da) fehlend.push(`Startpasswort · ${theme.name} · ${breite.px} px`);
            }
          }
          await ctx.close();
        } else {
          fehlend.push(`Startpasswort: der Wegwerf-Mitarbeiter kam nicht an (HTTP ${code})`);
        }
      } else {
        fehlend.push(`Startpasswort: Mitarbeiter nicht angelegt (HTTP ${antwort.status()})`);
      }
    }

    // --- Die Shell, als Administrator --------------------------------------
    const ctx = await fensterMitToken(browser, token);
    const seite = await ctx.newPage();

    /** Das Theme des Menschen umstellen -- ueber den Weg, den die Shell geht. */
    const themaSetzen = async theme => {
      const antwort = await kanal.put('/api/darstellung', { data: { theme: theme.wert } });
      if (antwort.status() !== 200) {
        console.log(`  (PUT /api/darstellung ${theme.wert} → HTTP ${antwort.status()})`);
      }
    };

    // Welche App im Rahmen und im Einzelnen zu sehen ist.
    const apps = await kanal
      .get('/api/apps')
      .then(a => (a.status() === 200 ? a.json() : null))
      .catch(() => null);
    const liste = apps?.data ?? apps?.apps ?? [];
    const wunsch = process.env.ARASUL_APP || '';
    const lieferbar = a => a?.staende?.live?.lieferbar || a?.staende?.test?.lieferbar;
    const app =
      liste.find(a => a.id === wunsch) ||
      liste.find(a => a.id === 'beispielapp' && lieferbar(a)) ||
      liste.find(lieferbar) ||
      null;

    // DIE APP MUSS DEM FOTOGRAFEN FREIGEGEBEN SEIN. Der erste Lauf am Orin
    // (29.08.2026) hat sechs leere Zellen geliefert und dabei die Wahrheit
    // gezeigt: der Rahmen sagte „beispielapp ist dir nicht freigegeben".
    // Eine Freigabe ist der Zustand, in dem ein Mensch die App ueberhaupt
    // sieht (C2) -- also stellt der Bogen ihn her und nimmt ihn am Ende
    // zurueck, so wie die Reihe ihren Wegwerf-Mitarbeiter wieder abraeumt.
    let freigabeZurueck = null;
    if (app) {
      const ich = await kanal
        .get('/api/auth/me')
        .then(a => (a.status() === 200 ? a.json() : null))
        .catch(() => null);
      const meineId = ich?.user?.id ?? ich?.data?.id ?? ich?.id ?? null;
      const stand = app?.staende?.live?.lieferbar ? 'live' : 'test';
      if (meineId != null) {
        const antwort = await kanal.post('/api/freigaben', {
          data: { app_id: app.id, benutzer_id: meineId, stand },
        });
        // 200 heisst: die Freigabe gab es schon. Dann bleibt sie auch stehen.
        if (antwort.status() === 201) {
          freigabeZurueck = `/api/freigaben/${app.id}/${meineId}`;
        } else if (antwort.status() >= 400) {
          console.log(`  (POST /api/freigaben → HTTP ${antwort.status()})`);
        }
      }
    }

    const ANSICHTEN = [
      {
        name: 'Übersicht',
        dateiname: 'uebersicht',
        kennzeichen: '[data-testid="uebersicht-seite"]',
        oeffnen: () => laden(seite, `${URL}/workspace`),
      },
      {
        name: 'Notizen',
        dateiname: 'notizen',
        kennzeichen: '#notizen-feld',
        // UNTER 900 PX SIND DIE NOTIZEN EINE EIGENE ANSICHT (D7), und der Weg
        // dorthin fuehrt durch das Hamburger-Menue -- nicht ueber den Knopf
        // der Kopfleiste, den es dort nicht gibt. Der erste Lauf am Orin hat
        // genau das gezeigt: zwei leere Zellen bei 390 px.
        oeffnen: async () => {
          await laden(seite, `${URL}/workspace`);
          await steht(seite, '[data-testid="uebersicht-seite"]', 30000);
          if (
            await seite
              .locator('#notizen-feld')
              .isVisible()
              .catch(() => false)
          )
            return;
          const schmal = await seite
            .locator("[data-testid='workspace-shell'][data-shell-aufbau='schmal']")
            .count()
            .catch(() => 0);
          if (schmal) {
            await seite
              .locator('[aria-label="Menü öffnen"]')
              .first()
              .click({ timeout: 10000 })
              .catch(() => {});
            await seite
              .locator('[data-testid="menue-notizen"]')
              .first()
              .click({ timeout: 10000 })
              .catch(() => {});
            return;
          }
          const knopf = seite.locator('[aria-label="Notizen einblenden"]').first();
          if (await knopf.count()) await knopf.click({ timeout: 10000 }).catch(() => {});
        },
        // Diese eine Zelle will die Notizen aufgeschlagen haben.
        notizenLassen: true,
      },
      ...(app
        ? [
            {
              name: 'App im Rahmen',
              dateiname: 'app-rahmen',
              kennzeichen: `[data-testid="app-rahmen-${app.id}"]`,
              oeffnen: async () => {
                await laden(seite, `${URL}/workspace/app/${app.id}`);
              },
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
        name: 'Einstellungen · Allgemein',
        dateiname: 'einstellungen-allgemein',
        kennzeichen: '.ara-kopf__titel',
        oeffnen: () => laden(seite, `${URL}/workspace/settings?tab=general`),
      },
      {
        name: 'Einstellungen · KI',
        dateiname: 'einstellungen-ki',
        kennzeichen: '.ara-kopf__titel',
        oeffnen: () => laden(seite, `${URL}/workspace/settings?tab=ki`),
      },
      {
        name: 'Einstellungen · Datenschutz',
        dateiname: 'einstellungen-datenschutz',
        kennzeichen: '.ara-kopf__titel',
        oeffnen: () => laden(seite, `${URL}/workspace/settings?tab=privacy`),
      },
      {
        name: 'Einstellungen · Fernzugriff',
        dateiname: 'einstellungen-fernzugriff',
        kennzeichen: '.ara-kopf__titel',
        oeffnen: () => laden(seite, `${URL}/workspace/settings?tab=remote-access`),
      },
      {
        name: 'System · Selbstheilung',
        dateiname: 'system-selbstheilung',
        kennzeichen: '.ara-kopf__titel',
        oeffnen: () => laden(seite, `${URL}/workspace/settings?tab=selfhealing`),
      },
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

    // --- Eine App im Einzelnen (Staende, Tester, Flows, Laeufe) -------------
    if (app) {
      // DAS KENNZEICHEN IST DIE EINZELANSICHT UND NICHT DIE LISTE. Der erste
      // Lauf am Orin fragte nach `apps-seite` -- dem Kennzeichen der LISTE --
      // und bekam bei 1024 und 1440 px vier leere Zellen: dort hatte der
      // Klick funktioniert, und genau deshalb war die Liste weg. Bei 390 px
      // kam er nicht durch, und die Zelle war „gruen". Ein Kennzeichen, das
      // beim Misserfolg dasteht und beim Erfolg nicht, misst das Gegenteil.
      await bogen(seite, themaSetzen, {
        name: 'App im Einzelnen',
        dateiname: 'app-einzeln',
        kennzeichen: `[data-testid="app-ansicht-${app.id}"]`,
        oeffnen: async () => {
          await laden(seite, `${URL}/workspace/settings?tab=apps`);
          await steht(seite, '[data-testid="apps-seite"]', 30000);
          await wegRaeumen(seite);
          await seite
            .locator(`[data-testid="app-oeffnen-${app.id}"]`)
            .first()
            .click({ timeout: 15000 })
            .catch(() => {});
          await seite.waitForTimeout(1000);
        },
      });
    }

    await ctx.close();

    // --- Aufraeumen --------------------------------------------------------
    if (freigabeZurueck) {
      const weg = await kanal.delete(freigabeZurueck).catch(() => null);
      if (!weg || weg.status() >= 300) {
        console.log(`  (die Freigabe auf ${freigabeZurueck} steht noch)`);
      }
    }
    if (angelegt) {
      const weg = await kanal
        .delete(`/api/benutzer/${encodeURIComponent(String(angelegt))}`)
        .catch(() => null);
      if (!weg || weg.status() >= 300) {
        console.log(`  (der Wegwerf-Mitarbeiter ${MITARB} steht noch am Geraet)`);
      }
    }
  } finally {
    await themaZurueck();
    await browser.close();
    await kanal.dispose();
  }

  // --- Das Verzeichnis der Bilder ------------------------------------------
  const ansichten = [...new Set(bilder.map(b => b.name))];
  const zeilen = [
    `# Bilderbogen ${STAND} — ${TAG}`,
    '',
    `${bilder.length} Bilder, ${ansichten.length} Ansichten mal zwei Themes mal drei Breiten.`,
    '',
    'Die Anmeldung und der Startpasswort-Wechsel tragen ihr Theme AUFGEZWUNGEN:',
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
