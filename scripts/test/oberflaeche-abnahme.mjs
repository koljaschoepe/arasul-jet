/**
 * Die Oberflaeche, ganz: alle Ansichten mal alle Breiten, fuer beide Rollen.
 * Phase D6 des Umbaus vom 26.08.2026.
 *
 * Ohne Buchstaben: die acht Abnahmen A1 bis A8 sind vergeben, und A7 ist der
 * siebentaegige Dauerlauf aus G2. Diese Reihe belegt keines der acht Gates,
 * sondern haelt die Oberflaeche zwischen ihnen ganz.
 *
 * WARUM DIESE DATEI NEU GESCHNITTEN IST. Sie stand seit Plan 023 und mass
 * „Modelle, Erweiterungen, Flows, Automation, Einstellungen" ueber die
 * Seitenleiste plus drei Adressen. Von diesen Ansichten gibt es heute genau
 * eine: der Erweiterungs-Store ist mit B4 gefallen, der Flow-Editor mit B3,
 * die Automation mit B5, und die Shell aus D1 hat eine andere Leiste. Die
 * Abnahme war gruen, weil sie die Ansichten nicht fand und dafuer eine eigene
 * Zeile schrieb -- sie mass nichts mehr.
 *
 * Daneben waren in D1 bis D5 fuenf weitere Bilder-Skripte entstanden, und
 * jedes trug DIESELBE Breitenschleife mit denselben vier Fragen. Sechs Stellen
 * mit einer Wahrheit ueber das Breitenraster, jede mit eigener Anmeldezahl:
 * zusammen sprengten sie die Anmeldedrossel (zehn je Viertelstunde und IP),
 * und die Abnahmen meldeten daraufhin Dinge ueber den MESSAUFBAU, die wie
 * Aussagen ueber das Geraet aussahen.
 *
 * DER SCHNITT: diese Reihe misst die OBERFLAECHE, die fuenf Phasenskripte
 * messen ihren HANDGRIFF. Das Breitenraster, die Konsolenfrage, die CSP und
 * die Bilder stehen ab D6 genau hier -- `csp-abnahme.mjs` und
 * `shell-bilder.mjs` sind gefallen, die vier uebrigen Bilder-Skripte haben
 * ihre Breitenschleife verloren und behalten das, was nur sie messen
 * (anlegen, freigeben, entscheiden, umstellen, sichern).
 *
 * WAS GEMESSEN WIRD
 *
 *   1. Zwoelf Ansichten mal drei Breiten (390, 1024, 1440). Zu jeder Zelle
 *      vier Fragen und ein Bild:
 *        - steht die Ansicht ueberhaupt (ihr Kennzeichen ist da)?
 *        - rollt die Seite waagerecht (dann passt etwas nicht hinein)?
 *        - steht etwas da (eine leere Flaeche ist kein Erfolg)?
 *        - meldet die Konsole einen Fehler?
 *      Vier der zwoelf gehoeren dem Mitarbeiter, acht dem Administrator.
 *   2. Die Aufteilung der Shell: unter 900 px keine Sidebar, darueber eine
 *      (`useSchmalesFenster`), die Notizen der rechten Spalte je Breite, und
 *      bei 1440 px bleibt die Mitte MIT offener Notizspalte ganz (der zweite
 *      Fund der D3-Abnahme, hier fuer jede Verwaltungsansicht statt fuer eine).
 *   3. CSP: traegt das Dokument eine Policy, verbietet sie `unsafe-eval`,
 *      stehen die vier weiteren Sicherheitskopfzeilen da -- und meldet der
 *      ganze Durchlauf einen Verstoss?
 *   4. Tastatur: die Reihenfolge durch die Anmeldung und durch die Shell,
 *      Escape schliesst einen Dialog, Enter bestaetigt ein Formular.
 *   5. Fehlerzustaende: Backend weg (Meldung statt weisser Seite), ein
 *      Mitarbeiter auf einer Admin-Adresse (Umleitung), eine Adresse, die es
 *      nicht gibt (ein Satz).
 *
 * GENAU ZWEI ANMELDUNGEN, und beide gehoeren dem Mitarbeiter: einmal mit dem
 * Startpasswort, das der Administrator gesetzt hat, und einmal mit dem
 * eigenen danach. Der Wechsel dazwischen entwertet alle seine Sitzungen
 * (`blacklistAllUserTokens`), eine dritte Anmeldung gibt es trotzdem nicht --
 * beide sind zugleich die Messung der Ansichten „Anmeldung" und
 * „Startpasswort-Wechsel". Der Administrator meldet sich GAR NICHT an: sein
 * Token kommt aus `$ARASUL_TOKEN` (`abnahmen.sh`) oder aus der abgelegten
 * Datei, und daraus wird sein Sitzungscookie gesetzt. Nur wenn beides fehlt,
 * kostet er eine dritte -- und legt sie fuer den naechsten Lauf ab.
 *
 * Drei Laeufe hintereinander kosten damit hoechstens sieben der zehn
 * Anmeldungen je Viertelstunde.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_PASSWORT=... node scripts/test/oberflaeche-abnahme.mjs
 *
 * Dreimal hintereinander, so wie die Phase gemessen wird:
 *   for i in 1 2 3; do ARASUL_PASSWORT=... \
 *     node scripts/test/oberflaeche-abnahme.mjs || break; done
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-oberflaeche-d6/`.
 *
 * Nicht zerstoerend fuer den Bestand: angelegt wird ein Mitarbeiter mit
 * Zeitstempel im Namen, freigegeben wird eine App, die schon da ist, und
 * beides wird am Ende entfernt -- auch wenn unterwegs etwas rot war.
 *
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request as pwRequest } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
/** Dieselbe Datei, die `scripts/test/anmeldung.sh` schreibt. */
const TOKEN_DATEI =
  process.env.ARASUL_TOKEN_DATEI || path.join(os.tmpdir(), 'arasul-abnahme-token');

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-oberflaeche-d6`);

/** Die drei Breiten aus dem Auftrag der Phase (wie in D1 bis D5). */
const BREITEN = [
  { px: 390, hoehe: 844, name: 'telefon' },
  { px: 1024, hoehe: 768, name: 'tablet' },
  { px: 1440, hoehe: 900, name: 'arbeitsplatz' },
];

/** Unter dieser Fensterbreite gibt es keine drei Spalten (`useSchmalesFenster`). */
const SCHMAL_AB_PX = 900;

const STEMPEL = Date.now();
const MITARB = `abnahme-d6-${STEMPEL}`;
const MAIL = `${MITARB}@abnahme.local`;
const PASS_START = `Start-${STEMPEL}`;
const PASS_SELBST = `Selbst-${STEMPEL}`;

// ---------------------------------------------------------------------------
// Buchfuehrung
// ---------------------------------------------------------------------------

/** Die Zellen der Tabelle: je Ansicht und Breite ein gruen oder rot. */
const tabelle = new Map();
/** Alles, was keine Zelle ist: CSP, Tastatur, Fehlerzustaende, Aufbau. */
const ergebnisse = [];
/** Was uebersprungen wurde, mit Grund. Kein Rot, aber auch kein Gruen. */
const uebersprungen = [];

function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return ok;
}

function ueberspringe(was, grund) {
  uebersprungen.push({ was, grund });
  console.log(`weg    ${was}  (${grund})`);
}

/**
 * Eine Zelle der Tabelle. `ok` ist das UND aller Fragen dieser Zelle; die
 * einzelnen Fragen stehen als Zeilen darunter, damit ein rotes Feld sagt,
 * WORAN es lag.
 */
function zelle(ansicht, breite, ok, detail = '') {
  if (!tabelle.has(ansicht)) tabelle.set(ansicht, new Map());
  const bisher = tabelle.get(ansicht).get(breite);
  tabelle.get(ansicht).set(breite, bisher === false ? false : ok);
  ergebnisse.push({ was: `${breite} px · ${ansicht}`, ok });
  console.log(
    `${ok ? 'gruen' : 'ROT  '}  ${breite} px · ${ansicht}${detail ? `  (${detail})` : ''}`
  );
}

// ---------------------------------------------------------------------------
// Die Wege zum Geraet, ohne Browser
// ---------------------------------------------------------------------------

/** Ein Rufkanal mit Bearer und OHNE Cookies -- dann greift die CSRF-Pflicht nicht. */
async function apiKanal(token) {
  return pwRequest.newContext({
    baseURL: URL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Traegt dieser Token noch? Eine Frage, die die Anmeldedrossel nicht anfasst. */
async function tokenGilt(token) {
  if (!token) return false;
  const kanal = await apiKanal(token);
  try {
    const antwort = await kanal.get('/api/auth/me');
    return antwort.status() === 200;
  } catch {
    return false;
  } finally {
    await kanal.dispose();
  }
}

/**
 * Eine Anmeldung -- und die einzige Stelle, die eine ausgibt.
 *
 * Der Kanal ist ein eigener und wird sofort weggeworfen: die Antwort setzt
 * Cookies, und ein Kanal MIT Sitzungscookie muesste danach bei jedem POST
 * einen CSRF-Wert mitschicken.
 */
let anmeldungen = 0;
async function anmelden(benutzer, passwort) {
  const kanal = await pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
  try {
    anmeldungen += 1;
    const antwort = await kanal.post('/api/auth/login', {
      data: { username: benutzer, password: passwort },
    });
    if (antwort.status() !== 200) {
      return { token: '', code: antwort.status() };
    }
    const rumpf = await antwort.json();
    return { token: rumpf.token ?? '', code: 200 };
  } catch (fehler) {
    // Playwrights Ausnahmen bringen ein mehrzeiliges „Call log" mit; in einer
    // Ergebniszeile ist davon nur die erste Zeile brauchbar.
    return { token: '', code: `Ausnahme: ${einzeilig(fehler.message, 100)}` };
  } finally {
    await kanal.dispose();
  }
}

/** Eine Fehlermeldung, die in eine Ergebniszeile passt. */
function einzeilig(text, laenge = 200) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, laenge);
}

/**
 * Horcht jemand unter dieser Adresse? Ohne diese Frage meldet jede Zeile
 * darunter etwas ueber den fehlenden Tunnel und nichts ueber das Geraet --
 * dieselbe Regel wie `arasul_geraet_erreichbar` in `anmeldung.sh`.
 */
async function geraetErreichbar() {
  const kanal = await pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
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
 * Der Token des Administrators, in dieser Reihenfolge -- genau wie
 * `arasul_token` in `scripts/test/anmeldung.sh`:
 *   1. `$ARASUL_TOKEN` (von `abnahmen.sh` gesetzt), keine Anmeldung
 *   2. die abgelegte Datei, wenn sie noch gilt
 *   3. einmal anmelden, und ablegen
 */
async function adminToken() {
  if (process.env.ARASUL_TOKEN) return { token: process.env.ARASUL_TOKEN, quelle: 'geteilt' };
  const abgelegt = fs.existsSync(TOKEN_DATEI) ? fs.readFileSync(TOKEN_DATEI, 'utf-8').trim() : '';
  if (await tokenGilt(abgelegt)) return { token: abgelegt, quelle: 'abgelegt' };
  const { token, code } = await anmelden(BENUTZER, PASSWORT);
  if (token) {
    try {
      fs.writeFileSync(TOKEN_DATEI, token, { mode: 0o600 });
    } catch {
      /* nicht schreibbar -- dann kostet der naechste Lauf wieder eine */
    }
  }
  return { token, quelle: `angemeldet, HTTP ${code}` };
}

// ---------------------------------------------------------------------------
// Der Browser
// ---------------------------------------------------------------------------

const gastgeber = new globalThis.URL(URL).hostname;

/**
 * Ein Browserfenster mit einer Sitzung, die aus einem TOKEN kommt statt aus
 * einer Anmeldung. Das Backend liest `arasul_session` als Bearer-Ersatz; den
 * CSRF-Wert holt sich die Oberflaeche selbst (`GET /api/auth/csrf`, `useApi`).
 */
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

/** Konsolenfehler und CSP-Verstoesse eines Fensters mitschreiben. */
const cspVerstoesse = [];
let konsole = [];

/**
 * Meldungen, die NICHT der Oberflaeche gehoeren: alles, was aus dem iframe
 * einer App kommt. Eine App stammt vom Partner, laeuft in einem eigenen
 * Dokument und bringt ihre eigene Konsole mit; sie hier rot zu zaehlen hiesse,
 * Arasuls Oberflaeche fuer den Quelltext eines anderen haften zu lassen. Sie
 * werden getrennt gemeldet und nicht verschwiegen.
 */
const vonEinerApp = ort => /\/apps\/[^/]+\//.test(ort || '');

/**
 * Ein Verstoss meldet sich auf zwei Wegen. Beide werden mitgeschrieben:
 * `securitypolicyviolation` hat die Einzelheiten (welche Richtlinie, welche
 * Datei, welche Zeile), und die Konsole erwischt auch das, was vor dem ersten
 * Skript passiert.
 *
 * DIE MELDUNG GEHT SOFORT HINAUS und wird nicht in der Seite gesammelt. Ein
 * `window.__cspVerstoesse`, das am Ende eingesammelt wird, kennt nur das
 * LETZTE Dokument: das Init-Skript laeuft je Navigation neu, und dieser
 * Durchlauf navigiert ueber vierzig Mal. Genau die Verstoesse, um die es geht,
 * waeren am Ende weg.
 */
async function fensterHorchen(ctx, seite) {
  seite.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const ort = m.location()?.url ?? '';
    if (/Content.Security.Policy/i.test(text)) {
      cspVerstoesse.push({ quelle: 'konsole', text: text.slice(0, 240) });
      return;
    }
    konsole.push({ text: text.slice(0, 200), ort, app: vonEinerApp(ort) });
  });
  seite.on('pageerror', e =>
    konsole.push({ text: `pageerror: ${String(e.message).slice(0, 200)}`, ort: '', app: false })
  );
  await ctx.exposeBinding('__arasulCspMelden', (_quelle, v) => {
    cspVerstoesse.push({ quelle: 'seite', ...v });
  });
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      // `blockedURI` ist bei eval nur das Wort "eval". Ohne `sourceFile` steht
      // am Ende "irgendwo im Buendel", und genau das kostet die Stunde.
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
 * Bekannt und geprueft harmlos (22.08.2026 am Orin): eine Bibliothek im
 * Hauptbuendel fragt mit `new Function("")`, ob sie kompilieren darf, und
 * faengt den Fehler ab. Unter der scharfen Policy lautet die Antwort Nein, und
 * mehr passiert nicht. Bewusst eng gefasst: nur `script-src` mit `eval`.
 */
const bekannteEvalProbe = v =>
  v.quelle === 'konsole'
    ? /unsafe-eval/.test(v.text || '')
    : v.richtlinie === 'script-src' && v.blockiert === 'eval';

// ---------------------------------------------------------------------------
// Die vier Fragen einer Zelle
// ---------------------------------------------------------------------------

const steht = (seite, waehler, grenze = 20000) =>
  seite
    .locator(waehler)
    .first()
    .waitFor({ timeout: grenze })
    .then(() => true)
    .catch(() => false);

/**
 * Eine Ansicht bei einer Breite messen und ihr Bild schreiben.
 *
 * @param oeffnen Bringt die Ansicht auf den Schirm (Adresse oder Klick).
 * @param kennzeichen Der Waehler, an dem die Ansicht zu erkennen ist.
 */
async function ansichtMessen(seite, { name, dateiname, breite, oeffnen, kennzeichen }) {
  await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
  konsole = [];
  await oeffnen();

  const da = await steht(seite, kennzeichen, 30000);
  if (!da) {
    zelle(name, breite.px, false, `kein ${kennzeichen}`);
    await seite
      .screenshot({ path: path.join(ZIEL, `${breite.px}-${dateiname}.png`) })
      .catch(() => {});
    return false;
  }

  // Die Ansicht holt ihre Listen; ohne diese Ruhe zeigt das Bild ein Skelett
  // und die Konsolenfrage kommt zu frueh.
  await seite.waitForTimeout(2000);

  const mass = await seite.evaluate(() => ({
    rollt: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    zeichen: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
  }));

  const eigene = konsole.filter(m => !m.app);
  const fremde = konsole.length - eigene.length;

  const fragen = [
    [`rollt nicht waagerecht`, !mass.rollt, `${mass.scrollWidth} gegen ${mass.clientWidth}`],
    [`es steht etwas da`, mass.zeichen > 40, `${mass.zeichen} Zeichen`],
    [
      `keine Fehler in der Konsole`,
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

  await seite
    .screenshot({ path: path.join(ZIEL, `${breite.px}-${dateiname}.png`) })
    .catch(() => {});
  return ok;
}

/**
 * Die Aufteilung der Shell bei dieser Breite.
 *
 * Unter 900 px faellt die Sidebar weg (die Aktivitaetsleiste bleibt, sie ist
 * einen Klick entfernt); darueber steht sie. Das ist die Regel, nicht ein
 * Mangel -- geprueft wird, dass sie greift.
 */
async function aufteilungMessen(seite, breite) {
  const sichtbar = await seite
    .locator('[data-panel]#sidebar')
    .evaluate(el => el.getAttribute('data-shell-hidden') === 'false')
    .catch(() => null);
  if (sichtbar === null) {
    pruefe(
      `${breite.px} px: die Sidebar der Shell ist auffindbar`,
      false,
      'kein [data-panel]#sidebar'
    );
    return;
  }
  const schmal = breite.px < SCHMAL_AB_PX;
  pruefe(
    `${breite.px} px: ${schmal ? 'keine' : 'eine'} Sidebar, wie vorgesehen`,
    schmal ? !sichtbar : sichtbar
  );
}

/**
 * Bleibt die Mitte MIT offener Notizspalte ganz?
 *
 * Der zweite Fund der D3-Abnahme am Orin: bei 1440 px mit offener Notizspalte
 * war die Einstellungsseite abgeschnitten -- die erste Tabellenspalte war
 * nicht zu sehen und ueber keinen Balken zu erreichen (Radix' `ScrollArea`,
 * behoben in D4). Bis D5 stand die Probe darauf an EINER Seite. Sie gilt fuer
 * jede.
 */
async function mitteBleibtGanz(seite, name, kennzeichen) {
  const notizenOffen = await seite
    .locator('#notizen-feld')
    .isVisible()
    .catch(() => false);
  if (!notizenOffen) {
    pruefe(
      `1440 px mit Notizen: ${name} -- die Notizspalte ist offen`,
      false,
      'kein #notizen-feld'
    );
    return;
  }
  const mass = await seite.evaluate(waehler => {
    const el = document.querySelector(waehler);
    if (!el) return null;
    const kasten = el.getBoundingClientRect();
    return {
      links: Math.round(kasten.left),
      rechts: Math.round(kasten.right),
      fenster: window.innerWidth,
      ueberlauf: el.scrollWidth - el.clientWidth,
    };
  }, kennzeichen);
  pruefe(
    `1440 px mit Notizen: ${name} bleibt ganz`,
    mass !== null && mass.links >= 0 && mass.rechts <= mass.fenster && mass.ueberlauf <= 1,
    mass ? `links ${mass.links}, rechts ${mass.rechts} von ${mass.fenster}` : 'nicht da'
  );
}

/**
 * Die Tastatur-Reihenfolge: hoechstens N Spruenge mit Tab, und zu jedem Halt
 * die Frage, ob er SICHTBAR ist und im Dokument NACH dem vorigen steht.
 *
 * Das ist die falsifizierbare Form der Frage „stimmt die Reihenfolge": ein
 * Fokus in einer eingeklappten Spalte oder in einem versteckten Tab springt
 * zurueck, und genau das faellt hier auf.
 *
 * DER UMBRUCH IST KEIN RUECKSPRUNG. Hinter dem letzten Element faengt der
 * Browser wieder vorn an, und das sieht wie ein Sprung rueckwaerts aus. Die
 * Schleife merkt sich deshalb den ERSTEN Halt und hoert auf, sobald sie wieder
 * dort steht -- sonst meldete jede Ansicht mit weniger Halten als Spruengen
 * ein falsches Rot.
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
      // Das Element bleibt in der Seite liegen; `compareDocumentPosition`
      // braucht beide zugleich, und ueber die Bruecke geht kein Knoten.
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
    if (!halt) break;
    if (halt.umbruch) break;
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

console.log(`=== Oberflaechen-Abnahme (Phase D6) gegen ${URL} ===\n`);

if (!(await geraetErreichbar())) {
  console.log(`Kein Geraet unter ${URL}.`);
  console.log('  Vom Arbeitsrechner:  ssh -f -N -L 8443:localhost:443 jetson');
  console.log(`  Auf dem Geraet:      ARASUL_URL=https://localhost:443 node ${process.argv[1]}`);
  process.exit(1);
}

// Erst jetzt: ein leerer Bilderordner nach einem Lauf, der nie angefangen hat,
// waere ein Ordner, den jemand spaeter deutet.
fs.mkdirSync(ZIEL, { recursive: true });

let browser;
let admin = { token: '' };
let app = '';
let mitarbeiterId = null;
let mitarbeiterToken = '';
let anfrage = null;

try {
  browser = await chromium.launch({ headless: true });

  // --- 0. Der Administrator, ohne Anmeldung wenn es geht --------------------
  admin = await adminToken();
  if (!pruefe('Der Administrator hat eine Sitzung', Boolean(admin.token), admin.quelle)) {
    // Geworfen und nicht `process.exit`: das raeumt auf und schreibt die
    // Tabelle. `process.exit` uebergeht das `finally`.
    throw new Error(
      'Ohne den Administrator gibt es nichts vorzubereiten. 429 heisst ' +
        'Anmeldedrossel: zehn je Viertelstunde und IP.'
    );
  }
  const adminApi = await apiKanal(admin.token);

  // Eine App, die schon am Geraet steht. Ohne sie fallen zwei Zellen weg --
  // gemeldet und nicht rot: das waere eine Aussage ueber den Messaufbau.
  const appsAntwort = await adminApi.get('/api/apps');
  const apps = appsAntwort.ok() ? ((await appsAntwort.json()).data ?? []) : [];
  app = apps[0]?.id ?? '';
  console.log(`gefunden  ${apps.length} App(s) am Geraet${app ? `, gemessen wird ${app}` : ''}`);

  // Der Wegwerf-Mitarbeiter. Sein Passwort kommt vom Administrator und ist
  // damit ein STARTPASSWORT (Migration 178) -- das ist die Voraussetzung fuer
  // die Ansicht „Startpasswort-Wechsel" weiter unten.
  const angelegt = await adminApi.post('/api/benutzer', {
    data: { username: MITARB, password: PASS_START, email: MAIL, rolle: 'mitarbeiter' },
  });
  mitarbeiterId = angelegt.ok() ? ((await angelegt.json()).data?.id ?? null) : null;
  if (
    !pruefe(
      'Ein Mitarbeiter fuer diesen Lauf ist angelegt',
      Boolean(mitarbeiterId),
      `id=${mitarbeiterId}, HTTP ${angelegt.status()}`
    )
  ) {
    throw new Error('Ohne ihn gibt es die Mitarbeiter-Sicht nicht zu messen.');
  }

  if (app) {
    const frei = await adminApi.post('/api/freigaben', {
      data: { app_id: app, benutzer_id: mitarbeiterId },
    });
    pruefe(
      `Die App ${app} ist fuer ihn freigegeben`,
      frei.status() === 201,
      `HTTP ${frei.status()}`
    );
  }

  // =========================================================================
  // Teil 1: der Mitarbeiter
  // =========================================================================
  const ctxM = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const seiteM = await ctxM.newPage();
  await fensterHorchen(ctxM, seiteM);

  // --- 1. Die Kopfzeilen des Dokuments -------------------------------------
  // Vor jeder Anmeldung, weil sie an keiner haengen. Bis zum 22.08.2026 trug
  // das Dokument als einziges keine Policy, waehrend jeder API-Pfad eine
  // hatte; genau das soll nie wieder unbemerkt passieren.
  const erste = await seiteM.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const kopf = erste?.headers() ?? {};
  const policy = kopf['content-security-policy'] || kopf['content-security-policy-report-only'];
  pruefe(
    'Das Dokument traegt eine Content-Security-Policy',
    Boolean(policy),
    policy ? `${policy.length} Zeichen` : 'keine'
  );
  pruefe(
    'Die Policy erlaubt kein unsafe-eval',
    !/unsafe-eval/.test(policy || ''),
    /unsafe-eval/.test(policy || '') ? 'steht drin' : 'nicht enthalten'
  );
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
      kennzeichen: 'input#username',
      oeffnen: async () => {
        await seiteM.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
    });
  }

  // Die Tastatur durch die Anmeldung: erst tippen, dann springen -- der Knopf
  // ist gesperrt, solange ein Feld leer ist, und ein gesperrter Knopf nimmt
  // keinen Fokus an. Ohne das Tippen misst die Zeile, dass es ihn nicht gibt.
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await seiteM.locator('input#username').fill(MAIL);
  await seiteM.locator('input#password').fill(PASS_START);
  await seiteM.locator('input#username').focus();
  const haelteAnmeldung = await tabReihenfolge(seiteM, 3);
  pruefe(
    'Anmeldung: Tab fuehrt von der Kennung ueber das Passwort auf den Knopf',
    haelteAnmeldung[0]?.name === 'password' &&
      haelteAnmeldung[1]?.name === 'button' &&
      haelteAnmeldung.every(h => h.sichtbar && h.nachDemVorigen),
    haelteAnmeldung.map(h => h.name).join(' -> ') || 'kein Halt'
  );

  // --- 3. Die erste Anmeldung ----------------------------------------------
  // Enter im Passwortfeld statt ein Klick: das Formular hat einen
  // Absende-Knopf, und ob die Eingabetaste ihn ausloest, ist die Frage nach
  // der Tastatur -- nicht nach dem Zeiger.
  await seiteM.locator('input#password').focus();
  anmeldungen += 1;
  await seiteM.keyboard.press('Enter');
  const wechselDa = await steht(seiteM, '[data-testid="passwort-wechseln"]', 45000);
  pruefe('Anmeldung: die Eingabetaste meldet an', wechselDa, `${anmeldungen}. Anmeldung`);
  if (!wechselDa) {
    throw new Error(
      'Die Anmeldung des Mitarbeiters kam nicht durch. Haeufigste Ursache: die ' +
        'zehn Anmeldungen je Viertelstunde und IP sind aufgebraucht (HTTP 429). ' +
        'Das sagt nichts ueber das Geraet.'
    );
  }

  // --- 4. Der Startpasswort-Wechsel, in drei Breiten ------------------------
  for (const breite of BREITEN) {
    await ansichtMessen(seiteM, {
      name: 'Startpasswort-Wechsel',
      dateiname: 'startpasswort',
      breite,
      kennzeichen: '[data-testid="passwort-wechseln"]',
      oeffnen: async () => {
        await seiteM.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
    });
  }

  // Enter bestaetigt auch hier: drei Felder, ein Knopf, und die Eingabetaste
  // im letzten Feld sendet ab (implizites Absenden eines `form`).
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await seiteM.locator('#passwort-alt').fill(PASS_START);
  await seiteM.locator('#passwort-neu').fill(PASS_SELBST);
  await seiteM.locator('#passwort-wiederholung').fill(PASS_SELBST);
  await seiteM.keyboard.press('Enter');
  // Der Wechsel entwertet alle Sitzungen; die Oberflaeche meldet ab und zeigt
  // wieder die Anmeldung.
  const zurueckZurAnmeldung = await steht(seiteM, 'input#username', 45000);
  pruefe(
    'Startpasswort-Wechsel: die Eingabetaste bestaetigt, danach steht die Anmeldung',
    zurueckZurAnmeldung
  );

  // --- 5. Die zweite Anmeldung ---------------------------------------------
  await seiteM.locator('input#username').fill(MAIL);
  await seiteM.locator('input#password').fill(PASS_SELBST);
  anmeldungen += 1;
  await seiteM.locator('button[type="submit"]').click();
  const shellDa = await steht(seiteM, '[data-testid="workspace-shell"]', 60000);
  pruefe(
    'Der Mitarbeiter kommt mit dem eigenen Passwort in die Shell',
    shellDa,
    `${anmeldungen}. Anmeldung`
  );
  if (!shellDa) throw new Error('Ohne seine Shell gibt es die Mitarbeiter-Sicht nicht zu messen.');

  // Sein Token liegt jetzt im Browser (`Login.tsx` legt ihn ab). Damit lassen
  // sich die Vorbereitungen fuer die naechsten Ansichten ohne eine dritte
  // Anmeldung erledigen.
  mitarbeiterToken = await seiteM.evaluate(() => localStorage.getItem('arasul_token') || '');

  // --- 6. Eine offene Freigabe herstellen ----------------------------------
  // Die Uebersicht zeigt die Liste NUR, wenn etwas darin steht (ein
  // Leerzustand waere eine Dauermeldung ueber etwas, das es nicht gibt).
  // Der erste Schritt des Flows `freigabe` ist ein fester Werkzeug-Schritt --
  // er haelt in Sekunden an und braucht das Modell nicht.
  if (app && mitarbeiterToken) {
    const mApi = await apiKanal(mitarbeiterToken);
    const start = await mApi
      .post(`/apps/${app}/api/flow?flow=freigabe&woche=Abnahme-D6`, {
        headers: { 'content-type': 'application/json' },
        data: {},
        timeout: 60000,
      })
      .catch(() => null);
    const lauf = start && start.ok() ? ((await start.json()).lauf ?? null) : null;
    if (lauf) {
      const ende = Date.now() + 120000;
      while (Date.now() < ende && !anfrage) {
        const offen = await mApi.get('/api/freigabe-anfragen');
        const liste = offen.ok() ? ((await offen.json()).data ?? []) : [];
        anfrage = liste.find(a => String(a.run_id) === String(lauf))?.id ?? null;
        if (!anfrage) await seiteM.waitForTimeout(3000);
      }
    }
    await mApi.dispose();
    if (anfrage) {
      console.log(`bereit    Eine offene Freigabe (${anfrage}) wartet auf der Uebersicht`);
    } else {
      ueberspringe(
        'Die Uebersicht mit einer offenen Freigabe',
        `der Flow "freigabe" der App ${app} hat nicht angehalten`
      );
    }
  } else if (!app) {
    ueberspringe('Die Uebersicht mit einer offenen Freigabe', 'keine App am Geraet');
  }

  // --- 7. Die Uebersicht, in drei Breiten ----------------------------------
  for (const breite of BREITEN) {
    const ok = await ansichtMessen(seiteM, {
      name: 'Uebersicht',
      dateiname: 'uebersicht',
      breite,
      kennzeichen: '[data-testid="uebersicht-seite"]',
      oeffnen: async () => {
        await seiteM.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
    });
    if (ok) {
      await aufteilungMessen(seiteM, breite);

      // Die Notizen der rechten Spalte. Sie werden nie ausgehaengt, sondern nur
      // versteckt (der Zettel speichert nach einer Sekunde Ruhe; ein Unmount
      // waehrend der Pause verloere den Text) -- gefragt wird deshalb, ob das
      // Feld DA ist, und bei 1440 px zusaetzlich, ob es zu sehen ist.
      const zettelDa = await steht(seiteM, '#notizen-feld', 20000);
      const zettelSichtbar = await seiteM
        .locator('#notizen-feld')
        .isVisible()
        .catch(() => false);
      pruefe(
        `${breite.px} px: die Notizen stehen in der rechten Spalte`,
        zettelDa && (breite.px < SCHMAL_AB_PX || zettelSichtbar),
        zettelDa ? (zettelSichtbar ? 'sichtbar' : 'da, aber verdeckt') : 'kein #notizen-feld'
      );

      if (anfrage) {
        const karte = await steht(seiteM, `[data-testid="freigabe-${anfrage}"]`, 20000);
        const frist = karte
          ? await seiteM
              .locator(`[data-testid="freigabe-${anfrage}-frist"]`)
              .innerText()
              .catch(() => '')
          : '';
        pruefe(
          `${breite.px} px: die offene Freigabe steht mit ihrer Restzeit da`,
          karte && /noch|Frist|abgelaufen/i.test(frist),
          frist || 'keine Karte'
        );
      }
    }
  }

  // --- 8. Die App im Rahmen, in drei Breiten -------------------------------
  if (app) {
    for (const breite of BREITEN) {
      await ansichtMessen(seiteM, {
        name: 'App im Rahmen',
        dateiname: 'app-im-rahmen',
        breite,
        kennzeichen: `[data-testid="app-rahmen-${app}"]`,
        oeffnen: async () => {
          await seiteM.goto(`${URL}/workspace/app/${app}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
        },
      });
    }
  } else {
    ueberspringe('Die App im Rahmen', 'keine App am Geraet');
  }

  // --- 9. Die Tastatur durch die Shell --------------------------------------
  // Von ganz oben: Kopfleiste, Aktivitaetsleiste, Sidebar, Mitte, Notizen,
  // Statusleiste -- in dieser Reihenfolge steht es im Dokument, und in dieser
  // Reihenfolge soll der Fokus laufen. Ein Halt in einer eingeklappten Spalte
  // oder in einem versteckten Tab springt zurueck und faellt hier auf.
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await seiteM.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await steht(seiteM, '[data-testid="workspace-shell"]', 45000);
  await seiteM.waitForTimeout(1500);
  await seiteM.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const halte = await tabReihenfolge(seiteM, 14);
  const unsichtbar = halte.filter(h => !h.sichtbar);
  const rueckwaerts = halte.filter(h => !h.nachDemVorigen);
  // Ohne diese Zeile waeren die beiden darunter bei NULL Halten gruen -- eine
  // Shell, die die Tastatur gar nicht annimmt, saehe aus wie eine, die es
  // richtig macht.
  pruefe('Shell: die Tastatur kommt ueberhaupt hinein', halte.length >= 4, `${halte.length} Halte`);
  pruefe(
    'Shell: der Fokus haelt nur auf Sichtbarem',
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

  // --- 10. Fehlerzustaende des Mitarbeiters ---------------------------------
  // Eine Admin-Adresse: die Shell legt sie auf die Uebersicht um. Das ist
  // Ausblenden und keine Berechtigung -- `requireRole` antwortet ihm auf jeden
  // Weg dahinter ohnehin mit 403.
  konsole = [];
  await seiteM.goto(`${URL}/workspace/settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await steht(seiteM, '[data-testid="uebersicht-seite"]', 30000);
  await seiteM.waitForTimeout(1000);
  // `/workspace/dashboard` und nicht `/workspace`: die Shell spiegelt den
  // aktiven Tab in die Adresse (`tabToPath`), und der Tab der Uebersicht heisst
  // `dashboard`. Gemessen wird, dass die Adresse NICHT mehr auf die
  // Einstellungen zeigt und die Uebersicht wirklich steht.
  pruefe(
    'Mitarbeiter auf einer Admin-Adresse: die Shell leitet auf die Uebersicht um',
    /^\/workspace(\/dashboard)?\/?$/.test(seiteM.url().replace(URL, '')),
    seiteM.url().replace(URL, '')
  );
  const mApiRolle = await apiKanal(mitarbeiterToken);
  const dazu403 = await mApiRolle.get('/api/system/info');
  pruefe(
    'und der Weg dahinter antwortet ihm mit 403',
    dazu403.status() === 403,
    `HTTP ${dazu403.status()}`
  );
  await mApiRolle.dispose();

  // Eine Adresse, die es nicht gibt: ein Satz und ein Weg zurueck, keine
  // weisse Flaeche. `/dokumente` ist ein Alt-Tab -- das Dokumentensystem ist
  // mit B2 gefallen, die Adresse steht noch in manchem Lesezeichen.
  await seiteM.goto(`${URL}/dokumente`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await seiteM.waitForTimeout(2000);
  const vierNullVier = await seiteM.evaluate(() => (document.body.innerText || '').trim());
  pruefe(
    'Ein Alt-Tab, den es nicht mehr gibt: ein Satz statt einer weissen Seite',
    /Diese Adresse gibt es nicht/.test(vierNullVier),
    vierNullVier.split('\n')[0]?.slice(0, 80) || 'nichts'
  );
  await seiteM.screenshot({ path: path.join(ZIEL, '1440-nicht-gefunden.png') }).catch(() => {});

  // Das Backend weg: jede Anfrage dahin wird abgewuergt und die Seite neu
  // geladen. Die Oberflaeche darf daran nicht zerbrechen -- sie soll sagen,
  // was los ist. (Die abgewuergten Anfragen schreiben selbst rote Zeilen in
  // die Konsole; die zaehlen hier ausdruecklich nicht, sie SIND die Messung.)
  await seiteM.route('**/api/**', route => route.abort());
  await seiteM.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await seiteM.waitForTimeout(3000);
  const ohneBackend = await seiteM.evaluate(() => (document.body.innerText || '').trim());
  pruefe(
    'Backend weg: die Seite zeichnet weiter, statt weiss zu bleiben',
    ohneBackend.length > 40,
    `${ohneBackend.length} Zeichen`
  );
  const feldDa = await steht(seiteM, 'input#username', 20000);
  if (feldDa) {
    await seiteM.locator('input#username').fill(MAIL);
    await seiteM.locator('input#password').fill(PASS_SELBST);
    await seiteM.locator('button[type="submit"]').click();
    const meldung = await seiteM
      .locator('#login-error')
      .innerText({ timeout: 20000 })
      .catch(() => '');
    pruefe(
      'Backend weg: der Anmeldeversuch nennt den Grund',
      /Verbindung|Server/i.test(meldung),
      meldung.slice(0, 80) || 'keine Meldung'
    );
  } else {
    pruefe('Backend weg: die Anmeldung steht', false, 'kein Anmeldefeld');
  }
  await seiteM.screenshot({ path: path.join(ZIEL, '1440-backend-weg.png') }).catch(() => {});
  await seiteM.unroute('**/api/**');

  // --- 11. Abmelden ---------------------------------------------------------
  // Das Benutzermenue der Kopfleiste, und nicht die Einstellungen: die sind
  // seit D1 eine Admin-Seite, und ein Mitarbeiter kaeme sonst nicht mehr
  // hinaus (D1, `WorkspaceMenuBar`).
  await seiteM.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shellFuersAbmelden = await steht(seiteM, '[data-testid="workspace-shell"]', 45000);
  if (shellFuersAbmelden) {
    await seiteM.locator('[data-testid="workspace-benutzermenue"]').click();
    const menue = await steht(seiteM, '[data-testid="workspace-abmelden"]', 15000);
    pruefe('Das Benutzermenue der Kopfleiste geht auf', menue);
    if (menue) {
      await seiteM.screenshot({ path: path.join(ZIEL, '1440-benutzermenue.png') }).catch(() => {});
      await seiteM.locator('[data-testid="workspace-abmelden"]').click();
      pruefe(
        'Abmelden fuehrt zurueck auf die Anmeldung',
        await steht(seiteM, 'input#username', 30000)
      );
    }
  } else {
    pruefe('Die Shell steht fuer das Abmelden', false, 'keine Shell');
  }

  await ctxM.close();

  // =========================================================================
  // Teil 2: der Administrator
  // =========================================================================
  const ctxA = await fensterMitToken(browser, admin.token);
  const seiteA = await ctxA.newPage();
  await fensterHorchen(ctxA, seiteA);

  /** Die acht Verwaltungsansichten, jede ueber ihre eigene Adresse. */
  const VERWALTUNG = [
    [
      'Einstellungen · Mitarbeiter',
      'einstellungen-mitarbeiter',
      '/workspace/settings?tab=benutzer',
      '[data-testid="mitarbeiter-seite"]',
    ],
    [
      'Einstellungen · Apps',
      'einstellungen-apps',
      '/workspace/settings?tab=apps',
      '[data-testid="apps-seite"]',
    ],
    [
      'Einstellungen · Sicherheit',
      'einstellungen-sicherheit',
      '/workspace/settings?tab=security',
      '[data-testid="sicherheit-seite"]',
    ],
    ['Modelle', 'modelle', '/workspace/modelle', '[data-testid="modelle-seite"]'],
    [
      'System · Auslastung',
      'system-auslastung',
      '/workspace/settings?tab=system',
      '[data-testid="auslastung-seite"]',
    ],
    [
      'System · Dienste',
      'system-dienste',
      '/workspace/settings?tab=services',
      '[data-testid="dienste-seite"]',
    ],
    [
      'System · Aktualisierungen',
      'system-aktualisierungen',
      '/workspace/settings?tab=updates',
      '[data-testid="update-seite"]',
    ],
    [
      'System · Sicherung',
      'system-sicherung',
      '/workspace/settings?tab=sicherung',
      '[data-testid="sicherung-seite"]',
    ],
  ];

  for (const [name, dateiname, pfad, kennzeichen] of VERWALTUNG) {
    for (const breite of BREITEN) {
      const ok = await ansichtMessen(seiteA, {
        name,
        dateiname,
        breite,
        kennzeichen,
        oeffnen: async () => {
          await seiteA.goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        },
      });
      // Der Fund der D3-Abnahme, verallgemeinert: bei 1440 px MIT offener
      // Notizspalte darf keine Verwaltungsansicht abgeschnitten sein.
      if (ok && breite.px === 1440) {
        await mitteBleibtGanz(seiteA, name, kennzeichen);
      }
    }
  }

  // --- Das Geraetezertifikat ------------------------------------------------
  // Es ist die Antwort auf die Warnung, die jeder Mitarbeiter beim ersten
  // Aufruf sieht (C10). Gemessen wird, dass der Knopf da ist und die Datei
  // wirklich kommt -- ein Knopf, der nichts herunterlaedt, sieht genauso aus.
  await seiteA.setViewportSize({ width: 1440, height: 900 });
  await seiteA.goto(`${URL}/workspace/settings?tab=security`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await steht(seiteA, '[data-testid="sicherheit-seite"]', 30000);
  const zertKnopf = seiteA.getByRole('button', { name: /Zertifikat herunterladen/ });
  if (await zertKnopf.count()) {
    const [ladung] = await Promise.all([
      seiteA.waitForEvent('download', { timeout: 45000 }).catch(() => null),
      zertKnopf.click(),
    ]);
    pruefe(
      'Sicherheit: das Geraetezertifikat laedt sich herunter',
      ladung !== null && /\.crt$/.test(ladung?.suggestedFilename() ?? ''),
      ladung?.suggestedFilename() ?? 'keine Datei'
    );
  } else {
    pruefe('Sicherheit: der Knopf fuer das Geraetezertifikat steht da', false, 'kein Knopf');
  }

  // --- Escape schliesst einen Dialog ---------------------------------------
  await seiteA.goto(`${URL}/workspace/settings?tab=benutzer`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await steht(seiteA, '[data-testid="mitarbeiter-seite"]', 30000);
  await seiteA.locator('[data-testid="mitarbeiter-anlegen-oeffnen"]').click();
  const dialogDa = await steht(seiteA, '#neu-username', 20000);
  pruefe('Der Dialog zum Anlegen geht auf', dialogDa);
  if (dialogDa) {
    await seiteA.keyboard.press('Escape');
    const zu = await seiteA
      .locator('#neu-username')
      .waitFor({ state: 'detached', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    pruefe('Escape schliesst ihn wieder', zu);
  }

  // --- Das Urteil ueber die CSP --------------------------------------------
  // Ueber BEIDE Rollen und den ganzen Durchlauf: die Verstoesse sind waehrend
  // der Fahrt herausgemeldet worden, nicht am Ende eingesammelt.
  const unerwartet = cspVerstoesse.filter(v => !bekannteEvalProbe(v));
  pruefe(
    'Kein unerwarteter CSP-Verstoss im ganzen Durchlauf',
    unerwartet.length === 0,
    `${unerwartet.length} unerwartet, ${cspVerstoesse.length - unerwartet.length} bekannte eval-Probe`
  );
  if (unerwartet.length) {
    console.log('\nWas gemeldet wurde:');
    const gesehen = new Set();
    for (const v of unerwartet) {
      const schluessel = `${v.richtlinie || ''}|${v.blockiert || ''}|${v.datei || ''}|${v.text || ''}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      console.log(
        `  ${v.richtlinie || 'unbekannt'}  ${v.quelle}  ${v.blockiert || ''}  ` +
          `${v.datei ? `${v.datei}:${v.zeile}` : ''}  ${v.text || ''}`
      );
    }
  }

  await ctxA.close();
  await adminApi.dispose();
} catch (fehler) {
  pruefe('Der Durchlauf kommt bis zum Ende', false, einzeilig(fehler.message, 240));
} finally {
  // --- Aufraeumen -----------------------------------------------------------
  // Auch nach einem roten Lauf: eine offene Freigabe, die niemand mehr
  // entscheidet, stuende dem naechsten im Weg, und ein Wegwerf-Mitarbeiter
  // ist nach einer Woche ein Konto, dessen Herkunft niemand kennt.
  if (anfrage && mitarbeiterToken) {
    const mApi = await apiKanal(mitarbeiterToken);
    const weg = await mApi
      .post(`/api/freigabe-anfragen/${anfrage}/ablehnen`, {
        data: { begruendung: 'Abnahme D6: dieser Lauf war eine Messung.' },
      })
      .catch(() => null);
    console.log(`aufgeraeumt  Freigabe ${anfrage} abgelehnt (HTTP ${weg?.status() ?? '-'})`);
    await mApi.dispose();
  }
  if (mitarbeiterId && admin.token) {
    const aApi = await apiKanal(admin.token);
    if (app) {
      await aApi.delete(`/api/freigaben/${app}/${mitarbeiterId}`).catch(() => null);
    }
    const geloescht = await aApi.delete(`/api/benutzer/${mitarbeiterId}`).catch(() => null);
    console.log(
      `aufgeraeumt  Benutzer ${mitarbeiterId} geloescht (HTTP ${geloescht?.status() ?? '-'})`
    );
    await aApi.dispose();
  }
  await browser?.close();
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
console.log('');
if (uebersprungen.length) {
  for (const u of uebersprungen) console.log(`uebersprungen: ${u.was} -- ${u.grund}`);
}
console.log(
  `${ergebnisse.length - rot} von ${ergebnisse.length} gruen, ${anmeldungen} Anmeldung(en)`
);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
