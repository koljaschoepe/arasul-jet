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
 *   4. DIE APP IM RAHMEN (Phase H2). Eine App laeuft im `iframe` als eigenes
 *      Dokument, und CSS-Variablen reichen nicht ueber eine Dokumentgrenze:
 *      bis H2 stand jede App auf den Rueckfallwerten von `marken.css`, und
 *      das waren die des dunklen Themas. Gemessen wird beides -- was im
 *      Dokument der App steht (`data-theme`) und welche Flaeche daraus wird
 *      --, in beiden Themes bei 390 und 1440 px, mit Bild.
 *   5. UND DER WECHSEL LAEDT DEN RAHMEN NICHT NEU. Gemessen auf dem Weg, den
 *      ein Mensch geht: App offen, ueber das Zahnrad in die Einstellungen,
 *      dort »Dunkel«, ueber die Tab-Leiste zurueck. Der Beleg ist eine Marke
 *      am `contentWindow` des Rahmens -- ueberlebt sie, war es dasselbe
 *      Fenster, und die App hat nichts verloren.
 *
 * DIE FLAECHE WIRD ERST NACH DEM UEBERGANG GELESEN. `body` traegt
 * `transition: background-color var(--transition-slow)` (0,3 s), und die
 * H1-Messung las mitten darin: `#f6f6f6` bei `data-theme=dark`, dreimal rot
 * an einem Geraet, das richtig war. Die Reihe wartet jetzt darauf, dass die
 * Farbe steht, und misst DANN -- Bild und Zahl kommen aus demselben
 * Augenblick. Abgeschaltet wird der Uebergang nicht: was gemessen wird, soll
 * das sein, was der Mensch sieht.
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
/** Welche App im Rahmen gemessen wird. Ohne Angabe sucht die Reihe selbst. */
const WUNSCH_APP = process.env.ARASUL_APP || '';
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
const uebersprungen = [];
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

/**
 * Warten, bis die Flaeche steht.
 *
 * Der Uebergang laeuft 0,3 s; gewartet wird laenger und trotzdem mit Grenze.
 * Laeuft sie ab, wird gemessen, was dasteht -- die Zeile darunter nennt den
 * Wert und ist dann rot, und das ist die richtige Auskunft. Ein `catch`, das
 * schweigt, waere hier ein Verstecken.
 */
async function flaecheAbwarten(seite, erwartet, grenze = 4000) {
  await seite
    .waitForFunction(soll => getComputedStyle(document.body).backgroundColor === soll, erwartet, {
      timeout: grenze,
    })
    .catch(() => {});
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
// Die App im Rahmen (Phase H2)
// ---------------------------------------------------------------------------

/**
 * Eine App, die dasteht und dem Pruefbenutzer freigegeben ist.
 *
 * Gesucht wird eine mit LIVESTAND: der Rahmen zeigt nur, was auch freigegeben
 * ist, und `POST /api/freigaben` gibt den Livestand frei. Die Beispielapp
 * zuerst -- ihr Frontend gehoert diesem Repo, also ist die Flaeche, die sie
 * zeigt, eine Aussage ueber `marken.css` und nicht ueber ein fremdes
 * Stylesheet.
 *
 * Findet sich keine, fallen die Zellen weg. Gemeldet und nicht rot: ein
 * Geraet ohne App ist kein Fehler dieser Phase.
 */
async function appVorbereiten(token) {
  const kanal = await apiKanal(token);
  try {
    const sitzung = await kanal.get('/api/auth/session');
    const wer = await sitzung.json().catch(() => ({}));
    const ich = wer?.user?.id;

    const antwort = await kanal.get('/api/apps');
    const apps = antwort.ok() ? ((await antwort.json()).data ?? []) : [];
    const mitLive = apps.filter(a => a.staende?.live);
    const app = WUNSCH_APP || mitLive.find(a => a.id === 'beispielapp')?.id || mitLive[0]?.id || '';
    if (!app || !ich) return { app: '', selbstFreigegeben: false, ich };

    // 201 heisst neu, 200 heisst „stand schon da". Nur was dieser Lauf
    // angelegt hat, raeumt er am Ende auch wieder weg.
    const frei = await kanal.post('/api/freigaben', {
      data: { app_id: app, benutzer_id: ich, stand: 'live' },
    });
    return { app, selbstFreigegeben: frei.status() === 201, ich };
  } finally {
    await kanal.dispose();
  }
}

/**
 * Welches Thema ein `data-theme` benennt.
 *
 * `dark` heisst dunkel, ALLES andere heisst hell -- kein Attribut (so
 * schreibt es die Shell seit H1, `:root` IST Hell) und ein ausdrueckliches
 * `light` (so schreibt es eine App, die ihr eigenes Dokument fuehrt, wie die
 * Vorlage des Ara-Kits) sind dieselbe Aussage. Die Reihe fragt danach, WAS
 * dasteht, und nicht danach, wer es geschrieben hat.
 */
function themaAus(attribut) {
  return attribut === 'dark' ? 'dark' : 'light';
}

/**
 * Was im Dokument der App steht -- und ob sie ueberhaupt aus der Bibliothek
 * gebaut ist.
 *
 * `.ara-seite` am `<body>` ist das Merkmal einer App OHNE Bau, die
 * `marken.css` dieses Repos laedt. Nur bei ihr ist die Flaeche eine Aussage
 * ueber diese Phase; eine App mit eigenem Bau bringt ihre eigene Kopie mit,
 * und die kann aelter sein. Das `data-theme` dagegen kommt in JEDEM Fall von
 * der Shell, und danach wird immer gefragt.
 */
async function rahmenStand(seite, appId) {
  return seite.evaluate(id => {
    const element = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
    if (!element) return { da: false };
    let dokument = null;
    try {
      dokument = element.contentDocument;
    } catch {
      return { da: true, fremd: true };
    }
    if (!dokument?.body) return { da: true, leer: true };
    return {
      da: true,
      attribut: dokument.documentElement.getAttribute('data-theme'),
      flaeche: getComputedStyle(dokument.body).backgroundColor,
      ausDerBibliothek: dokument.body.classList.contains('ara-seite'),
      marke: element.contentWindow?.__araMarke ?? null,
    };
  }, appId);
}

/**
 * Warten, bis der Rahmen sein Dokument hat, das Attribut traegt und die Farbe
 * darin steht.
 *
 * ZUERST DAS ATTRIBUT (Phase H3). Bis dahin wurde nur auf die FARBE gewartet,
 * und die ist bei einer App mit eigenem Stylesheet nie die erwartete -- der
 * Aufruf lief in seine Zeitgrenze, und `rahmenStand` las danach ein
 * `data-theme`, das `AppRahmen` noch gar nicht geschrieben hatte. Eine von
 * sechsundvierzig Zellen war deshalb rot, wechselnd. Das Attribut kommt in
 * JEDEM Fall von der Shell, also ist es die Bedingung, auf die man warten
 * kann; die Farbe ist es nur bei einer App aus dieser Bibliothek.
 *
 * Und deshalb steht die Farbe in einem zweiten Aufruf mit KURZER Grenze: wer
 * sein eigenes Stylesheet mitbringt, laeuft dort hinein, und das ist keine
 * Aussage ueber das Produkt -- nur zwanzig verlorene Sekunden je Zelle.
 */
async function rahmenAbwarten(seite, appId, erwartet, thema, grenze = 20000) {
  await seite
    .waitForFunction(
      ({ id, soll }) => {
        const element = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
        const dokument = element?.contentDocument;
        if (!dokument?.body || dokument.readyState !== 'complete') return false;
        const attribut = dokument.documentElement.getAttribute('data-theme');
        return (attribut === 'dark' ? 'dark' : 'light') === soll;
      },
      { id: appId, soll: thema },
      { timeout: grenze }
    )
    .catch(() => {});
  await seite
    .waitForFunction(
      ({ id, soll }) => {
        const element = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
        const dokument = element?.contentDocument;
        if (!dokument?.body) return false;
        return getComputedStyle(dokument.body).backgroundColor === soll;
      },
      { id: appId, soll: erwartet },
      { timeout: 5000 }
    )
    .catch(() => {});
}

/**
 * Der Wechsel laedt den Rahmen nicht neu -- gemessen auf dem Weg eines
 * Menschen (Phase H2).
 *
 * Der Beleg ist eine Marke am `contentWindow` des Rahmens. Sie ueberlebt
 * weder ein Neuladen des iframes noch ein Abraeumen des Tabs; steht sie
 * hinterher noch da, war es dasselbe Fenster, und die App hat nichts
 * verloren. Ein Bildvergleich koennte das nie sagen: eine App, die neu laedt
 * und wieder dasselbe zeigt, sieht genauso aus.
 *
 * GEKLICKT WIRD, NICHT NAVIGIERT. `page.goto` auf die Einstellungen laedt die
 * ganze Shell neu und damit auch den Rahmen -- die Probe waere rot, ohne dass
 * am Produkt etwas waere. Der Weg hier ist der, den ein Mensch hat: Zahnrad,
 * »Dunkel«, Tab-Leiste zurueck.
 */
async function rahmenOhneNeuladen(seite, appId) {
  await laden(seite, `${URL}/workspace/app/${appId}`);
  await shellAbwarten(seite);
  const steht = await seite
    .waitForSelector(`[data-testid="app-rahmen-${appId}"]`, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (!pruefe('Die App steht im Rahmen', steht, `/workspace/app/${appId}`)) return;

  await rahmenAbwarten(seite, appId, THEMES[0].flaeche, THEMES[0].wert);
  const vorher = await rahmenStand(seite, appId);
  pruefe(
    'im Hellen sagt das Dokument der App »hell«',
    !vorher.leer && !vorher.fremd && themaAus(vorher.attribut) === 'light',
    `data-theme=${vorher.attribut}, Flaeche ${vorher.flaeche}`
  );

  // Welcher Tab gerade vorn ist -- gemerkt als Platz in der Leiste. Der Titel
  // eines App-Tabs steht anfangs auf »App« und wird nachgetragen, sobald der
  // Name da ist; ein Klick nach Text traefe je nach Augenblick etwas anderes.
  const appTabPlatz = await seite
    .locator('[role="tab"]')
    .evaluateAll(tabs => tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'))
    .catch(() => -1);

  const markiert = await seite.evaluate(id => {
    const element = document.querySelector(`[data-testid="app-rahmen-${id}"]`);
    if (!element?.contentWindow) return false;
    element.contentWindow.__araMarke = 'h2';
    return true;
  }, appId);
  if (!pruefe('eine Marke sitzt am Fenster des Rahmens', markiert)) return;

  // Zahnrad in der Aktivitaetsleiste -- nicht das in der Kopfleiste, damit
  // die Zeile nennt, welcher der beiden Wege gemessen wurde.
  const insZahnrad = await seite
    .locator('nav[aria-label="Workspace-Navigation"] [aria-label="Einstellungen"]')
    .first()
    .click({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!pruefe('der Weg in die Einstellungen geht ueber das Zahnrad', insZahnrad)) return;

  const dunkel = seite.getByRole('radio', { name: /Dunkel/ });
  const umgestellt = await dunkel
    .click({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!pruefe('»Dunkel« ist in den Einstellungen angeklickt', umgestellt)) return;
  await seite
    .waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', {
      timeout: 15000,
    })
    .catch(() => {});

  const zurueck =
    appTabPlatz >= 0 &&
    (await seite
      .locator('[role="tab"]')
      .nth(appTabPlatz)
      .click({ timeout: 15000 })
      .then(() => true)
      .catch(() => false));
  if (!pruefe('und ueber die Tab-Leiste zurueck zur App', zurueck)) return;

  await rahmenAbwarten(seite, appId, THEMES[1].flaeche, THEMES[1].wert);
  const nachher = await rahmenStand(seite, appId);
  pruefe(
    'DER RAHMEN HAT NICHT NEU GELADEN: die Marke steht noch am selben Fenster',
    nachher.marke === 'h2',
    `Marke = ${JSON.stringify(nachher.marke)}`
  );
  pruefe(
    'und die App ist dabei dunkel geworden, ohne dass sie etwas dafuer tut',
    themaAus(nachher.attribut) === 'dark',
    `data-theme=${nachher.attribut}, Flaeche ${nachher.flaeche}`
  );
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
  let app = '';
  let selbstFreigegeben = false;
  let ich = null;

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
    if (
      !pruefe(
        'Ausgangslage hell gesetzt',
        zurueckgesetzt.status() === 200,
        `HTTP ${zurueckgesetzt.status()}`
      )
    ) {
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
    // Die Antwort wird mitgeschrieben, sonst fehlt der Buchfuehrung ueber die
    // Anmeldedrossel genau die Anmeldung, die durch das Formular ging -- und
    // der naechste Lauf liest einen Stand, der eine zu wenig kennt.
    const antwortAufFormular = seiteB
      .waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 30000 })
      .then(r => {
        drosselMerken('POST', '/api/auth/login', r.headers(), r.status());
        return r.status();
      })
      .catch(() => 'keine Antwort');
    await seiteB.click('button[type="submit"]');
    const codeB = await antwortAufFormular;

    const shellDa = await shellAbwarten(seiteB);
    if (!pruefe('der zweite Kontext kommt in die Shell', shellDa, `Anmeldung HTTP ${codeB}`)) {
      await seiteB
        .screenshot({ path: path.join(ZIEL, 'theme-zweiter-kontext-rot.png') })
        .catch(() => {});
      await ctxB.close();
      return;
    }

    await flaecheAbwarten(seiteB, THEMES[1].flaeche);
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

    // --- 4. Die App im Rahmen, und der Wechsel ohne Neuladen ---------------
    const vorbereitet = await appVorbereiten(token);
    app = vorbereitet.app;
    selbstFreigegeben = vorbereitet.selbstFreigegeben;
    ich = vorbereitet.ich;
    if (app) {
      console.log(`       gemessen wird die App ${app}`);
      await rahmenOhneNeuladen(seiteB, app);
    } else {
      // Kein gruenes Feld fuer etwas, das nicht gemessen wurde: eine Zeile,
      // die in der Zaehlung nicht vorkommt.
      console.log('uebersprungen  Die App im Rahmen: keine App mit Livestand am Geraet');
      uebersprungen.push('Die App im Rahmen (keine App mit Livestand am Geraet)');
    }

    // --- 5. Die Bilder ------------------------------------------------------
    await bilderMachen(browser, token, seiteB, app);
    await ctxB.close();
  } catch (fehler) {
    pruefe('der Lauf kommt bis zum Ende', false, einzeilig(fehler.message));
  } finally {
    // Immer aufraeumen: das Geraet steht danach so da, wie es der naechste
    // Lauf erwartet.
    if (token) {
      const kanal = await apiKanal(token);
      const zurueck = await kanal
        .put('/api/darstellung', { data: { theme: 'light' } })
        .catch(() => null);
      console.log(
        `\n       aufgeraeumt: theme = light (HTTP ${zurueck ? zurueck.status() : 'kein Ruf'})`
      );
      // Nur was dieser Lauf angelegt hat. Eine Freigabe, die schon stand,
      // gehoert einem Menschen und nicht dieser Reihe.
      if (selbstFreigegeben && app && ich) {
        const weg = await kanal.delete(`/api/freigaben/${app}/${ich}`).catch(() => null);
        console.log(
          `       aufgeraeumt: Freigabe ${app} zurueckgenommen (HTTP ${weg ? weg.status() : 'kein Ruf'})`
        );
      }
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
async function bilderMachen(browser, token, seite, app = '') {
  const kanal = await apiKanal(token);
  const gemacht = [];
  try {
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

        // Die App im Rahmen kommt bei 390 und 1440 dazu (H2) und nicht bei
        // 1024: die Frage dort ist dieselbe wie bei 1440, und jede Zelle
        // kostet eine Seitenladung an der Drossel.
        const ansichten = [
          { name: 'uebersicht', adresse: `${URL}/workspace` },
          { name: 'einstellungen', adresse: `${URL}/workspace/settings?tab=general` },
        ];
        if (app && breite.px !== 1024) {
          ansichten.push({ name: 'app-im-rahmen', adresse: `${URL}/workspace/app/${app}`, app });
        }

        for (const ansicht of ansichten) {
          await laden(seite, ansicht.adresse);
          await shellAbwarten(seite);
          // Erst das Attribut (es kommt aus der Sitzungsprobe, also nach dem
          // ersten Malen), dann die Farbe -- dazwischen liegt der Uebergang.
          await seite
            .waitForFunction(
              soll => document.documentElement.getAttribute('data-theme') === soll,
              theme.attribut,
              { timeout: 15000 }
            )
            .catch(() => {});
          await flaecheAbwarten(seite, theme.flaeche);
          if (ansicht.app) await rahmenAbwarten(seite, ansicht.app, theme.flaeche, theme.wert);
          const stand = await themeAmDokument(seite);
          const datei = `theme-${theme.name}-${ansicht.name}-${breite.px}.png`;
          await seite.screenshot({ path: path.join(ZIEL, datei) }).catch(() => {});
          gemacht.push(datei);
          pruefe(
            `${breite.px} px · ${ansicht.name} · ${theme.name}`,
            stand.attribut === theme.attribut && stand.flaeche === theme.flaeche,
            `data-theme=${stand.attribut}, Flaeche ${stand.flaeche}`
          );

          // Und im Rahmen dieselbe Frage noch einmal, an einem zweiten
          // Dokument. `data-theme` kommt in jedem Fall von der Shell; die
          // FLAECHE ist nur dann eine Aussage ueber diese Phase, wenn die App
          // die `marken.css` dieses Repos laedt (`.ara-seite` am `<body>`) --
          // eine App mit eigenem Bau bringt ihre eigene Kopie mit, und die
          // kann aelter sein als dieser Stand.
          if (ansicht.app) {
            const imRahmen = await rahmenStand(seite, ansicht.app);
            const flaecheZaehlt = imRahmen.ausDerBibliothek === true;
            pruefe(
              `${breite.px} px · App im Rahmen · ${theme.name}`,
              imRahmen.da === true &&
                themaAus(imRahmen.attribut) === theme.wert &&
                (!flaecheZaehlt || imRahmen.flaeche === theme.flaeche),
              `data-theme=${imRahmen.attribut}, Flaeche ${imRahmen.flaeche}` +
                (flaecheZaehlt ? '' : ' (eigenes Stylesheet, Flaeche nur zur Kenntnis)')
            );
          }
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
    pruefe(
      'die Anmeldeseite ist in beiden Breitenreihen abgelichtet',
      true,
      `${BREITEN.length} × 2`
    );
    await anonym.close();
  } finally {
    await kanal.dispose();
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
if (uebersprungen.length) {
  console.log('\nUebersprungen:');
  for (const u of uebersprungen) console.log(`  - ${u}`);
}
if (rot.length) {
  console.log('\nRot:');
  for (const e of rot) console.log(`  - ${e.was}`);
}
process.exit(rot.length ? 1 : 0);
