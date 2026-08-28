/**
 * Die Oberflaeche, ganz: alle Ansichten mal alle Breiten, fuer beide Rollen.
 * Phase D6 des Umbaus vom 26.08.2026, fortgeschrieben in D7.
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
 *   1. Zwoelf Ansichten mal drei Breiten (390, 1024, 1440), dazu die Notizen
 *      bei 390 px. Zu jeder Zelle vier Fragen und ein Bild:
 *        - steht die Ansicht ueberhaupt (ihr Kennzeichen ist da)?
 *        - rollt die Seite waagerecht (dann passt etwas nicht hinein)?
 *        - steht etwas da (eine leere Flaeche ist kein Erfolg)?
 *        - meldet die Konsole einen Fehler?
 *      Vier der zwoelf gehoeren dem Mitarbeiter, acht dem Administrator; die
 *      dreizehnte Zeile hat nur die eine Breite, weil es die Notizen als
 *      Blatt nur dort gibt.
 *   2. Die Aufteilung der Shell: unter 900 px keine Sidebar, darueber eine
 *      (`useSchmalesFenster`), die Notizen je Breite, und bei 1440 px bleibt
 *      die Mitte MIT offener Notizspalte ganz (der zweite Fund der
 *      D3-Abnahme, hier fuer jede Verwaltungsansicht statt fuer eine).
 *
 *      UNTER 900 PX GIBT ES EINE SPALTE, UND NICHTS LIEGT UEBEREINANDER.
 *      Das ist der Weg aus zwei Messungen am Orin (28.08.2026). Zuerst
 *      verdeckte die Notizspalte bei 390 px die Mitte vollstaendig -- alle
 *      sieben Verwaltungsansichten rot, jedes Bild „NOTIZEN, noch nichts
 *      notiert"; D6 legte die Notizen daraufhin als BLATT darueber. Der
 *      zweite Lauf zeigte, dass das die halbe Antwort war: die App stand
 *      abgedunkelt hinter dem Blatt, und ein Klick darunter kam nicht durch,
 *      weder fuer Playwright noch fuer einen Menschen.
 *
 *      Seit D7 hat der schmale Aufbau deshalb einen EIGENEN Aufbau: ein
 *      Hamburger-Menue in der Kopfleiste statt Aktivitaetsleiste und
 *      Sidebar, keine Tab-Leiste, und die Notizen sind eine eigene ANSICHT.
 *      Diese Reihe raeumt vor jeder schmalen Messung ausdruecklich weg, was
 *      obenauf liegen koennte (`wegRaeumen`, und vor jedem Klick
 *      `klickFrei`), misst die Notizen danach als eigene Zelle „Notizen" bei
 *      390 px -- aufgeschlagen, wie jemand sie waehlt -- und prueft am
 *      Menue, dass eine Ansicht sie wieder zumacht.
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
 * Anmeldungen je Viertelstunde. Ist das Fenster trotzdem voll -- weil der
 * Ueberordner und der Rueckbau daneben ihre eigenen ausgeben --, WARTET die
 * Reihe die Restzeit ab, statt rot zu werden: sie merkt sich nach jeder
 * Anmeldung, was `RateLimit-Remaining` und `RateLimit-Reset` gesagt haben
 * (neben der Token-Datei, damit der naechste Lauf es weiss), fragt danach vor
 * dem ersten Handgriff, und ein 429 am Formular wird ueber `Retry-After`
 * abgewartet und einmal wiederholt.
 *
 * SEIT DEM 28.08.2026 GILT DAS FUER JEDE DROSSEL, nicht nur fuer die Anmeldung
 * (`scripts/test/drossel.mjs`): jede Antwort, die eine traegt, wird gemerkt,
 * und vor jeder Seitenladung (`laden`) fragt die Reihe, ob noch Platz ist.
 * Fuenf Laeufe ohne Pause sind zehn Anmeldungen -- genau das Fenster; der
 * sechste wartet, und sagt es.
 *
 * UND WO WARTEN NICHT REICHT, WIRD WIEDERHOLT. Die Buchfuehrung aus den
 * Kopfzeilen kann nie vollstaendig sein: hinter Traefik zaehlen die Drosseln
 * je IP, und das ist EINE IP fuer die Reihe, den Ueberordner daneben und
 * jeden Menschen im Browser. Kommt trotzdem ein 429, zeigt die Oberflaeche
 * die Anmeldung, und die Zelle sah aus wie eine Aussage ueber die Ansicht.
 * `ansichtMessen` merkt sich deshalb, ob waehrend der Zelle eine Drossel 429
 * gesagt hat, wartet ab, was sie sagt, und misst noch einmal.
 *
 * WAS AM 28.08.2026 GEMESSEN WURDE, und warum das Backend dabei etwas
 * abbekommen hat: ein Lauf macht 44 Seitenladungen in 129 s und stand in
 * seiner vollsten Minute bei 22 von 30 auf der Drossel, die `needs-setup`
 * und `logout` trug -- 73 Prozent, ohne Luft fuer irgendwen sonst. Die
 * Sitzungsprobe, auf die die Abnahmen geschaut haben, stand bei 21 von 120.
 * Die enge Drossel war nie die genannte. Seither tragen beide Proben, die
 * eine Seitenladung macht, dieselbe (`probeLimiter`, 120 je Minute), und die
 * dreissig gehoeren dem Abmelden allein.
 *
 * Und ein 401 fuer den Pruefbenutzer heisst seither nicht Ende: der Werksreset
 * von G1 loescht ihn mit, die Reihe legt ihn einmal am Geraet an
 * (`scripts/util/pruefbenutzer.sh`, idempotent) und meldet sich noch einmal an.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   ARASUL_PASSWORT=... node scripts/test/oberflaeche-abnahme.mjs
 *
 * Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TOKEN,
 * ARASUL_TOKEN_DATEI, ARASUL_TAG -- und ARASUL_APP / ARASUL_FLOW, wenn die
 * offene Freigabe von einer anderen App als der Beispielapp kommen soll.
 *
 * Dreimal hintereinander, so wie die Phase gemessen wird:
 *   for i in 1 2 3; do ARASUL_PASSWORT=... \
 *     node scripts/test/oberflaeche-abnahme.mjs || break; done
 *
 * Die Bilder landen unter `docs/plans/audits/<datum>-oberflaeche/`.
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
import { pruefbenutzerAnlegen } from './anmeldung.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
/** Die App, an der die Mitarbeiter-Sicht gemessen wird. Leer = selbst suchen. */
const WUNSCH_APP = process.env.ARASUL_APP || '';
/** Der Flow, der eine offene Freigabe herstellt (C7). */
const FLOW = process.env.ARASUL_FLOW || 'freigabe';

// WIE EINE APP IHREN FLOW STARTET, SAGT DIE APP. Voreingestellt ist der Weg
// der `beispielapp`; die Referenz-App `urlaubsantrag` reicht statt dessen
// einen Vorgang ein. Dieselben vier Stellschrauben wie in
// `app-admin-abnahme.sh` (Abnahme A5), damit ein Aufruf beide Reihen mit
// denselben Werten fuettern kann:
//
//   ARASUL_FLOW_WEG=/apps/urlaubsantrag/api/vorgaenge
//   ARASUL_FLOW_RUMPF='{"titel":"Abnahme","text":"drei Tage im Mai"}'
//   ARASUL_FLOW_CODE=201 ARASUL_FLOW_FELD=vorgang.lauf
//
// Ohne sie meldete die Reihe am 28.08.2026 am Orin „der Flow hat nicht
// angehalten" und uebersprang die Uebersicht mit einer offenen Freigabe --
// dabei kannte die App den Weg `/flow` schlicht nicht.
const FLOW_WEG = process.env.ARASUL_FLOW_WEG || null;
const FLOW_RUMPF = process.env.ARASUL_FLOW_RUMPF || null;
const FLOW_CODE = Number(process.env.ARASUL_FLOW_CODE || 202);
const FLOW_FELD = process.env.ARASUL_FLOW_FELD || 'lauf';

/** Ein Feld aus einer Antwort holen, auch ueber einen Punktpfad („a.b"). */
function ausAntwort(daten, pfad) {
  return pfad.split('.').reduce((wert, teil) => (wert == null ? wert : wert[teil]), daten) ?? null;
}

/**
 * Wie weit ein Pfad in eine Antwort hineinkam, und was dort stand.
 *
 * Fuer die Meldung, wenn `ausAntwort` nichts findet: „kein Feld vorgang.lauf"
 * laesst offen, ob es `vorgang` nicht gibt oder `lauf` darin fehlt. Das sind
 * zwei verschiedene Naechste-Schritte, und die zweite Haelfte ist die
 * haeufigere (Phase G2 am Orin: der Weg antwortete 201 und trug `vorgang`,
 * nur ohne `lauf`).
 */
export function pfadEnde(daten, pfad) {
  let wert = daten;
  const gegangen = [];
  for (const teil of pfad.split('.')) {
    if (wert == null || typeof wert !== 'object' || !(teil in wert)) {
      const felder =
        wert && typeof wert === 'object' ? Object.keys(wert).join(', ') || '(leer)' : String(wert);
      return `„${teil}" fehlt${gegangen.length ? ` in ${gegangen.join('.')}` : ''}; da waren: ${felder}`;
    }
    gegangen.push(teil);
    wert = wert[teil];
  }
  return `„${pfad}" war ${JSON.stringify(wert)}`;
}
/** Dieselbe Datei, die `scripts/test/anmeldung.sh` schreibt. */
const TOKEN_DATEI =
  process.env.ARASUL_TOKEN_DATEI || path.join(os.tmpdir(), 'arasul-abnahme-token');

// Was diese Reihe ueber die Drosseln des Geraets weiss, steht seit dem
// 28.08.2026 in `scripts/test/drossel.mjs` -- ALLE DREI, nicht nur die
// Anmeldung. Lauf 4 von fuenf hintereinander fiel an „390 px
// Startpasswort-Wechsel, GET /api/auth/session HTTP 429": die Reihe hatte nur
// die Anmeldedrossel abgewartet und die Sitzungsprobe nie gezaehlt.

const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-oberflaeche`);

/** Die drei Breiten aus dem Auftrag der Phase (wie in D1 bis D5). */
const BREITEN = [
  { px: 390, hoehe: 844, name: 'telefon' },
  { px: 1024, hoehe: 768, name: 'tablet' },
  { px: 1440, hoehe: 900, name: 'arbeitsplatz' },
];

/** Unter dieser Fensterbreite gibt es keine drei Spalten (`useSchmalesFenster`). */
const SCHMAL_AB_PX = 900;

const STEMPEL = Date.now();
const MITARB = `abnahme-d7-${STEMPEL}`;
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
 * Eine Seite laden -- und vorher fragen, ob das Geraet sie noch annimmt.
 *
 * Jede Seitenladung kostet ZWEI aus der Proben-Drossel: die Frage an
 * `needs-setup` (App.tsx) und die Sitzungsprobe (`checkAuth`). Ein 429 dort
 * zeigt die Anmeldung statt der Ansicht, und die Oberflaeche wiederholt es
 * mit Absicht nicht (das ist eine Antwort). Also wartet die Reihe VOR dem
 * Laden, aus dem, was die letzten Antworten gesagt haben -- und wenn es
 * trotzdem passiert, wiederholt `ansichtMessen` die Zelle.
 */
async function laden(seite, adresse, optionen = {}) {
  await seitenladungAbwarten();
  return seite.goto(adresse, { waitUntil: 'domcontentloaded', timeout: 60000, ...optionen });
}

/**
 * Eine Anmeldung -- und die einzige Stelle, die eine ausgibt.
 *
 * Der Kanal ist ein eigener und wird sofort weggeworfen: die Antwort setzt
 * Cookies, und ein Kanal MIT Sitzungscookie muesste danach bei jedem POST
 * einen CSRF-Wert mitschicken.
 */
let anmeldungen = 0;
async function anmelden(benutzer, passwort, { versuche = 2 } = {}) {
  for (let versuch = 1; ; versuch += 1) {
    await drosselAbwarten('anmeldung', 1);
    const kanal = await pwRequest.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
    let nochmal = 0;
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
      // Wie am Formular: ein 429 ist eine Wartezeit und kein Ergebnis.
      if (antwort.status() === 429 && versuch < versuche) {
        nochmal = drosselNochmalNach('anmeldung');
      } else {
        return { token: '', code: antwort.status() };
      }
    } catch (fehler) {
      // Playwrights Ausnahmen bringen ein mehrzeiliges „Call log" mit; in einer
      // Ergebniszeile ist davon nur die erste Zeile brauchbar.
      return { token: '', code: `Ausnahme: ${einzeilig(fehler.message, 100)}` };
    } finally {
      await kanal.dispose();
    }
    await drosselSchlafen('anmeldung', nochmal);
  }
}

/**
 * Eine Anmeldung ueber das FORMULAR -- und die Antwort, die dahinter kam.
 *
 * Der Grund fuer diese Funktion steht im zweiten Fund der ersten D6-Messung:
 * Lauf 2 von dreien blieb an „Der Mitarbeiter kommt mit dem eigenen Passwort
 * in die Shell" haengen, Lauf 1 und 3 nicht -- und die Zeile sagte nur, dass
 * die Shell nicht kam. Ob die Anmeldung mit 401 abgelehnt wurde, mit 429
 * gedrosselt, ob sie gar nicht abgeschickt wurde oder ob sie durchging und
 * danach etwas anderes klemmte, war aus der Ausgabe nicht zu lesen; die
 * Ursache liess sich hinterher nicht mehr feststellen.
 *
 * Ab jetzt haelt die Reihe die HTTP-Antwort fest, bevor sie auf den Schirm
 * wartet. Ein rotes Feld nennt danach die Zahl.
 *
 * UND EIN 429 IST KEIN ROT. Die Drossel sagt mit `Retry-After`, wie lange sie
 * noch zu ist; die Reihe wartet das ab und schickt das Formular ein zweites
 * Mal. `tun` fuellt die Felder deshalb selbst aus und ist wiederholbar -- ein
 * Klick auf einen Knopf allein waere es nicht.
 */
async function anmeldungAbschicken(seite, tun, { versuche = 2 } = {}) {
  for (let versuch = 1; ; versuch += 1) {
    await drosselAbwarten('anmeldung', 1);
    anmeldungen += 1;
    konsole = [];
    const wartet = seite
      .waitForResponse(
        antwort =>
          antwort.request().method() === 'POST' &&
          new globalThis.URL(antwort.url()).pathname === '/api/auth/login',
        { timeout: 60000 }
      )
      .catch(() => null);
    await tun();
    const antwort = await wartet;
    if (!antwort) return { status: 0, grund: 'keine Antwort auf /api/auth/login gesehen' };
    drosselMerken('POST', '/api/auth/login', antwort.headers(), antwort.status());
    if (antwort.status() === 200) return { status: 200, grund: '' };
    if (antwort.status() === 429 && versuch < versuche) {
      // Mindestens fuenf Sekunden, hoechstens ein Fenster: eine Antwort ohne
      // brauchbare Zahl darf weder sofort wieder anklopfen noch ewig liegen.
      await drosselSchlafen('anmeldung', drosselNochmalNach('anmeldung'));
      continue;
    }
    const rumpf = await antwort.json().catch(() => null);
    return {
      status: antwort.status(),
      grund: rumpf?.error?.code || rumpf?.error?.message || '',
    };
  }
}

/**
 * Warum ist die Anmeldung nicht angekommen? Alles, was in eine Zeile passt:
 * die HTTP-Antwort, die Meldung auf der Seite, die Adresse und die erste
 * Konsolenzeile.
 */
async function warumNichtAngemeldet(seite, ausgang) {
  const meldung = await seite
    .locator('#login-error')
    .innerText({ timeout: 3000 })
    .catch(() => '');
  const eigene = konsole.filter(m => !m.app);
  return [
    `${anmeldungen}. Anmeldung`,
    `HTTP ${ausgang.status}${ausgang.grund ? ` ${ausgang.grund}` : ''}`,
    `Adresse ${seite.url().replace(URL, '')}`,
    meldung ? `Meldung "${einzeilig(meldung, 80)}"` : '',
    eigene.length ? `Konsole: ${einzeilig(eigene[0].text, 80)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
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
  let { token, code } = await anmelden(BENUTZER, PASSWORT);
  // Ein 401 fuer den Pruefbenutzer heisst seit dem 28.08.2026: der Werksreset
  // von G1 hat ihn mitgenommen. Einmal anlegen, einmal wiederholen -- und
  // sagen, was passiert ist, statt „Ohne den Administrator gibt es nichts".
  if (code === 401) {
    console.log(`Der Benutzer ${BENUTZER} meldet sich nicht an (HTTP 401). Lege ihn an ...`);
    const angelegt = pruefbenutzerAnlegen({ benutzer: BENUTZER, passwort: PASSWORT });
    console.log(`${angelegt.ok ? 'gruen' : 'ROT  '}  ${angelegt.meldung}`);
    if (angelegt.ok) {
      ({ token, code } = await anmelden(BENUTZER, PASSWORT));
      if (token) code = 'nach dem Anlegen des Pruefbenutzers 200';
    }
  }
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
 * Jeder Wortwechsel mit `/api/auth/*`, mitgeschrieben.
 *
 * WARUM DAS HIER STEHT. Die vier Laeufe am Orin nach dem D7-Deploy
 * (28.08.2026, 90/91, 91/91, 90/91, 91/91) waren zweimal rot, je genau einmal
 * und je an einer anderen Stelle — und beide roten Felder nannten nur das
 * Symptom: „arasul_session blieb mit Wert stehen" und „kein
 * [data-testid=passwort-wechseln]". Woran es lag, stand nirgends, und eine
 * Abnahme, die ihren eigenen Befund nicht erklaeren kann, kostet den halben
 * Tag, den sie sparen soll.
 *
 * Beide Stellen haengen an genau einer HTTP-Antwort: das Cookie faellt in
 * `POST /api/auth/logout`, und ob die Seite „Neues Passwort" kommt, entscheidet
 * `GET /api/auth/session`. Also wird jede Antwort dieser Wege festgehalten,
 * samt der, die gar nicht kam (`requestfailed`) — und das rote Feld nennt sie.
 */
const authWege = [];

/** Die Wortwechsel eines Weges seit einem Zeitpunkt, in einer Zeile. */
function authSeit(ab, pfad) {
  const treffer = authWege.filter(w => w.zeit >= ab && w.pfad === pfad);
  if (!treffer.length) return `${pfad} nie gerufen`;
  return treffer.map(w => `${w.methode} ${pfad} → ${w.ausgang}`).join(', ');
}

/**
 * Was steht ueberhaupt auf dem Schirm? Gefragt wird, wenn ein Kennzeichen
 * fehlt: „kein [data-testid=…]" sagt, was NICHT da ist, und das ist die
 * uninteressante Haelfte. Die Anmeldung statt der erwarteten Seite ist ein
 * anderer Befund als eine haengende Ladeanzeige.
 */
async function wasStehtDa(seite) {
  const marken = [
    ['die Anmeldung', 'input#username'],
    ['eine Ladeanzeige', '.loading-spinner'],
    ['die Shell', '[data-testid="workspace-shell"]'],
  ];
  for (const [wort, waehler] of marken) {
    const da = await seite
      .locator(waehler)
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    if (da) return wort;
  }
  const text = await seite
    .locator('body')
    .innerText({ timeout: 3000 })
    .catch(() => '');
  return text ? `„${einzeilig(text, 80)}"` : 'nichts';
}

/**
 * Wartet, bis das Sitzungscookie gefallen ist — hoechstens diese Spanne.
 *
 * Kein Nachlassen der Frage, sondern ein Zugestaendnis an den Messweg: die
 * Oberflaeche zeigt die Anmeldung, sobald ihr eigener Zustand geraeumt ist, und
 * der Cookie-Speicher des Browsers ist ein anderer Ort als das Dokument. Was
 * gemessen wird, bleibt dasselbe — dass am Ende nichts liegen bleibt —, und
 * WIE LANGE es gedauert hat, steht in der Zeile.
 */
async function sitzungscookieFaellt(ctx, grenze = 5000) {
  const beginn = Date.now();
  for (;;) {
    const uebrig = await ctx.cookies(URL);
    const tot = uebrig.some(c => c.name === 'arasul_session' && c.value);
    if (!tot || Date.now() - beginn >= grenze) {
      return { uebrig, tot, gewartet: Date.now() - beginn };
    }
    await new Promise(weiter => setTimeout(weiter, 250));
  }
}

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

  // Die Auth-Wege mitschreiben, Antwort UND Ausfall. Ein Weg, der gar nicht
  // erst durchkam, ist der interessantere der beiden Faelle.
  // Ein Horcher, der wirft, reisst den Lauf mit: eine Zeile, die nur der
  // Fehlersuche dient, darf die Messung nie kosten.
  const merken = (url, methode, ausgang) => {
    try {
      const pfad = new globalThis.URL(url).pathname;
      if (!pfad.startsWith('/api/auth/')) return;
      authWege.push({ zeit: Date.now(), pfad, methode, ausgang });
    } catch {
      /* keine gewoehnliche Adresse (data:, blob:) -- die interessiert hier nicht */
    }
  };
  seite.on('response', a => {
    merken(a.url(), a.request().method(), `HTTP ${a.status()}`);
    // Und jede Antwort, die eine Drossel traegt, sagt der Reihe, wie viel
    // Platz noch ist -- `drosselFuer` sortiert aus, was keine traegt.
    try {
      const pfad = new globalThis.URL(a.url()).pathname;
      drosselMerken(a.request().method(), pfad, a.headers(), a.status());
    } catch {
      /* keine gewoehnliche Adresse */
    }
  });
  seite.on('requestfailed', a =>
    merken(a.url(), a.method(), a.failure()?.errorText || 'ohne Antwort')
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
 * Wegraeumen, was im schmalen Aufbau obenauf liegen koennte.
 *
 * Zwei Dinge gibt es dort: die Notizen als eigene ANSICHT (dann steht die
 * Mitte nicht da) und das Hamburger-MENUE (dann liegt es ueber allem). Diese
 * Zeile misst keines von beiden -- sie stellt den Zustand her, in dem eine
 * Ansicht ueberhaupt zu sehen ist. Der Unterschied ist wichtig: eine Ansicht,
 * die hinter etwas anderem gemessen wird, sagt nichts ueber die Ansicht (der
 * erste Fund der D6-Messung am Orin). Was die REGEL prueft, steht in
 * `aufteilungMessen` und in der eigenen Zelle „Notizen" bei 390 px.
 *
 * GEFRAGT WIRD DER AUFBAU UND NICHT DIE FENSTERBREITE. Derselbe Knopf in der
 * Kopfleiste schaltet ueber 900 px die Notiz-SPALTE, und die ist persistiert:
 * ein Zumachen „zur Sicherheit" haette sie dort fuer den Rest des Laufs
 * versteckt und `mitteBleibtGanz` um seinen Gegenstand gebracht.
 * `data-shell-aufbau="schmal"` steht nur am schmalen Aufbau -- damit ist die
 * Frage die richtige und nicht bloss die bequeme.
 */
async function wegRaeumen(seite) {
  const schmal = await seite
    .locator("[data-testid='workspace-shell'][data-shell-aufbau='schmal']")
    .count()
    .catch(() => 0);
  if (!schmal) return;

  // Das Menue zuerst: es liegt ueber der Kopfleiste, in der der Notizen-Knopf
  // sitzt. Andersherum klickte der zweite Griff ins Leere.
  const menueOffen = await seite
    .locator("[data-testid='workspace-schmal-menue']")
    .count()
    .catch(() => 0);
  if (menueOffen) {
    await seite
      .locator('[aria-label="Menü schließen"]')
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  }

  const notizenDa = await seite
    .locator("[data-panel]#right[data-shell-hidden='false']")
    .count()
    .catch(() => 0);
  if (notizenDa) {
    await seite
      .locator('[aria-label="Notizen ausblenden"]')
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  }
}

/**
 * Ein Klick im Arbeitsplatz, dem nichts im Weg liegt.
 *
 * Playwright zielt auf die Mitte des Elements und prueft vorher, dass dort
 * auch wirklich dieses Element liegt; liegt etwas darueber, wartet er bis zur
 * Zeitgrenze und wirft dann. Genau das hat den zweiten D6-Lauf am Orin
 * abgebrochen (28.08.2026, Lauf 1 und 3 an derselben Stelle): eine App-Kachel
 * der Uebersicht unter dem offenen Notizen-Blatt, `locator.click` Timeout
 * 15000 ms -- und der Lauf endete dort, vor der Tastatur und vor den
 * Fehlerzustaenden. Das Blatt gibt es seit D7 nicht mehr; die Regel bleibt.
 *
 * Also: erst wegraeumen, was oben liegt, dann klicken. Die eine Stelle, die
 * ABSICHTLICH gegen ein offenes Menue klickt -- der Weg zurueck auf die
 * Uebersicht, der ja durch das Menue fuehrt --, ruft `click` weiter selbst.
 *
 * UND SIE WIRFT NICHT. Ein Klick, der nicht durchkommt, ist eine rote Zeile
 * wert und nicht das Ende des Durchlaufs: was danach noch zu messen waere --
 * die Tastatur, die Fehlerzustaende, die acht Verwaltungsansichten -- ist
 * mehr wert als die Ausnahme. Der Rueckgabewert sagt, was war.
 */
async function klickFrei(seite, ziel, grenze = 15000) {
  await wegRaeumen(seite);
  return ziel
    .click({ timeout: grenze })
    .then(() => true)
    .catch(() => false);
}

/** Wie oft eine Zelle wiederholt wird, wenn ihr eine Drossel dazwischenkam. */
const VERSUCHE_JE_ZELLE = 3;

/**
 * Eine Ansicht bei einer Breite messen und ihr Bild schreiben.
 *
 * EIN 429 IST KEIN ROT, AUCH HIER NICHT. Die Reihe wartet vor jeder
 * Seitenladung, aber ihre Buchfuehrung kann nie vollstaendig sein: hinter
 * Traefik zaehlen die Drosseln je IP, und das ist EINE IP fuer alles, was am
 * Geraet anklopft. Kommt trotzdem einer, sagt die Oberflaeche genau das, was
 * sie ohne Sitzung sagt — sie zeigt die Anmeldung —, und die Zelle sah bis
 * zum 28.08.2026 aus wie eine Aussage ueber die Ansicht. Sie war eine ueber
 * den Messaufbau. Also: gemerkt, ob waehrend der Zelle eine Drossel 429
 * gesagt hat, abgewartet, was sie sagt, und die Zelle noch einmal. Dieselbe
 * Regel, die das Anmeldeformular seit D6 hat.
 *
 * @param oeffnen Bringt die Ansicht auf den Schirm (Adresse oder Klick).
 * @param kennzeichen Der Waehler, an dem die Ansicht zu erkennen ist.
 * @param notizenZu Schmal vorher wegraeumen, was obenauf liegt. Nur die Zelle
 *        „Notizen" selbst will sie aufgeschlagen haben.
 * @param warum Wird gerufen, wenn das Kennzeichen ausbleibt, und liefert einen
 *        Satz dazu. „kein [data-testid=…]" sagt, was NICHT da ist — die
 *        uninteressante Haelfte. Woran es lag, weiss nur die Ansicht selbst.
 */
async function ansichtMessen(
  seite,
  { name, dateiname, breite, oeffnen, kennzeichen, notizenZu = true, warum = null }
) {
  let da = false;
  let gedrosselt = null;
  for (let versuch = 1; versuch <= VERSUCHE_JE_ZELLE && !da; versuch += 1) {
    const vorher = drossel429Stand();
    await seite.setViewportSize({ width: breite.px, height: breite.hoehe });
    konsole = [];
    await oeffnen();
    if (notizenZu) await wegRaeumen(seite);

    da = await steht(seite, kennzeichen, 30000);
    if (da) break;
    const drossel = drossel429Seit(vorher);
    if (!drossel) break;
    gedrosselt = drossel;
    if (versuch < VERSUCHE_JE_ZELLE) {
      console.log(
        `nochmal  ${breite.px} px · ${name}: die Drossel „${drossel}" sagte 429, das ist keine Ansicht`
      );
      await drosselSchlafen(drossel, drosselNochmalNach(drossel));
    }
  }

  if (!da) {
    const zusatz = warum ? await warum().catch(e => `warum-Frage selbst rot: ${e.message}`) : '';
    const drossel = gedrosselt
      ? `die Drossel „${gedrosselt}" sagte 429, auch nach ${VERSUCHE_JE_ZELLE} Versuchen`
      : '';
    zelle(
      name,
      breite.px,
      false,
      [`kein ${kennzeichen}`, drossel, zusatz].filter(Boolean).join('; ')
    );
    await seite
      .screenshot({ path: path.join(ZIEL, `${breite.px}-${dateiname}.png`) })
      .catch(() => {});
    return false;
  }

  // Die Ansicht holt ihre Listen; ohne diese Ruhe zeigt das Bild ein Skelett
  // und die Konsolenfrage kommt zu frueh.
  await seite.waitForTimeout(2000);

  const mass = await seite.evaluate(() => {
    const worte = wurzel => (wurzel?.innerText || '').replace(/\s+/g, ' ').trim().length;
    // WAS IN EINEM RAHMEN STEHT, STEHT AUCH DA (Phase D7).
    //
    // `innerText` des Dokuments endet am `iframe`, und die Zelle „App im
    // Rahmen" misst genau einen: der ganze Inhalt der App liegt darin. Bis D6
    // fiel das nicht auf, weil bei jeder Breite die Sidebar, die Tab-Leiste
    // und die Notizspalte daneben standen und ihre Woerter mitzaehlten. Seit
    // D7 gibt es unter 900 px nichts davon -- die App hat die Spalte fuer
    // sich --, und die Frage „steht etwas da" haette dort ohne diese Zeile
    // eine App uebersehen, die vollstaendig dasteht.
    //
    // Der Rahmen ist gleicher Herkunft (`/apps/<id>/`, dasselbe Geraet),
    // deshalb geht das ueberhaupt; `try` haelt den Fall offen, dass einmal
    // einer nicht ist.
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
 * Unter 900 px gibt es seit D7 einen EIGENEN Aufbau und keine geschrumpfte
 * Fassung des Arbeitsplatzes: keine Sidebar, keine Aktivitaetsleiste, keine
 * Tab-Leiste -- ein Hamburger-Knopf in der Kopfleiste und eine Spalte
 * darunter. Darueber die drei Spalten aus D1. Das ist die Regel, nicht ein
 * Mangel; geprueft wird, dass sie greift.
 */
async function aufteilungMessen(seite, breite) {
  const schmal = breite.px < SCHMAL_AB_PX;

  const aufbau = await seite
    .locator("[data-testid='workspace-shell']")
    .getAttribute('data-shell-aufbau')
    .catch(() => null);
  pruefe(
    `${breite.px} px: die Shell steht ${schmal ? 'schmal' : 'dreispaltig'}`,
    aufbau === (schmal ? 'schmal' : 'drei-spalten'),
    `data-shell-aufbau=${aufbau ?? 'fehlt'}`
  );

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
  pruefe(
    `${breite.px} px: ${schmal ? 'keine' : 'eine'} Sidebar, wie vorgesehen`,
    schmal ? !sichtbar : sichtbar
  );

  if (!schmal) return;

  // DIE REGEL AUS D7: unter 900 px eine Spalte, und die gehoert der Ansicht.
  //
  // Gemessen wird sie an der Mitte und nicht an den Notizen -- die Frage ist
  // ja, ob die Ansicht ihre Flaeche bekommt. Bis D6 bekam sie bei 390 px null
  // Pixel: 48 fuer die Aktivitaetsleiste, 160 fuer die Sidebar, 220 fuer die
  // Notizen sind mehr, als 390 hergeben, und das Uebrige war null. Seit D7
  // faellt dort beides weg, und die Zahl ist entsprechend schaerfer: die
  // Mitte hat die GANZE Breite, nicht die uebrige.
  const mass = await seite.evaluate(() => {
    const kasten = el => (el ? Math.round(el.getBoundingClientRect().width) : -1);
    const offen = el => Boolean(el) && el.getAttribute('data-shell-hidden') === 'false';
    return {
      mitte: kasten(document.querySelector('[data-panel]#main')),
      notizenOffen: offen(document.querySelector('[data-panel]#right')),
      leiste: document.querySelectorAll('[aria-label="Workspace-Navigation"]').length,
      hamburger: document.querySelectorAll("[data-testid='workspace-menue-knopf']").length,
      tabs: document.querySelectorAll('[role="tab"]').length,
      fenster: window.innerWidth,
    };
  });
  pruefe(
    `${breite.px} px: die Notizen stehen nicht neben der Mitte, und die Mitte hat die ganze Breite`,
    !mass.notizenOffen && mass.mitte >= mass.fenster - 2,
    `Mitte ${mass.mitte} px von ${mass.fenster}, Notizen ${mass.notizenOffen ? 'OFFEN' : 'zu'}`
  );
  pruefe(
    `${breite.px} px: ein Hamburger-Knopf statt Aktivitaetsleiste und Tab-Leiste`,
    mass.hamburger === 1 && mass.leiste === 0 && mass.tabs === 0,
    `Hamburger ${mass.hamburger}, Aktivitaetsleiste ${mass.leiste}, Tabs ${mass.tabs}`
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

console.log(`=== Oberflaechen-Abnahme (Phase D7) gegen ${URL} ===\n`);

if (!(await geraetErreichbar())) {
  console.log(`Kein Geraet unter ${URL}.`);
  console.log('  Vom Arbeitsrechner:  ssh -f -N -L 8443:localhost:443 jetson');
  console.log(`  Auf dem Geraet:      ARASUL_URL=https://localhost:443 node ${process.argv[1]}`);
  process.exit(1);
}

// Erst jetzt: ein leerer Bilderordner nach einem Lauf, der nie angefangen hat,
// waere ein Ordner, den jemand spaeter deutet.
fs.mkdirSync(ZIEL, { recursive: true });

// Und erst recht jetzt: die Drosseln VOR dem ersten Handgriff. Diese Reihe
// kostet zwei Anmeldungen; mitten im Lauf darauf zu warten hiesse, den
// Wegwerf-Mitarbeiter und seine offene Freigabe eine Viertelstunde lang am
// Geraet stehen zu lassen. Die beiden Minuten-Drosseln fragt jede Seitenladung
// selbst (`laden`); hier nur, damit der Lauf nicht auf der Kante anfaengt.
await drosselAbwarten('anmeldung', 2);
await seitenladungAbwarten();

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

  // Eine App, die schon am Geraet steht. Gesucht wird eine mit LIVESTAND:
  // `POST /api/freigaben` gibt den Livestand frei, und der Rahmen zeigt nur,
  // was auch freigegeben ist (`AppRahmen`). Eine App, die nur einen Teststand
  // hat, ergaebe hier drei rote Zellen ueber den Messaufbau.
  //
  // Findet sich keine, fallen die Zellen weg -- gemeldet und nicht rot.
  const appsAntwort = await adminApi.get('/api/apps');
  const apps = appsAntwort.ok() ? ((await appsAntwort.json()).data ?? []) : [];
  const mitLive = apps.filter(a => a.staende?.live);
  // Die Beispielapp zuerst, wenn sie dasteht: ihr Flow `freigabe` haelt an
  // einem festen Werkzeug-Schritt an und braucht das Modell nicht. Eine andere
  // App kann denselben Flow tragen oder nicht -- dann wird die Station
  // uebersprungen, und die uebrigen Zellen messen trotzdem.
  app = WUNSCH_APP || mitLive.find(a => a.id === 'beispielapp')?.id || mitLive[0]?.id || '';
  console.log(
    `gefunden  ${apps.length} App(s) am Geraet${app ? `, gemessen wird ${app}` : ', keine mit Livestand'}`
  );

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
  const erste = await laden(seiteM,URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
        await laden(seiteM,URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  const ersteAnmeldung = await anmeldungAbschicken(seiteM, async () => {
    // Wiederholbar: nach einem 429 steht dasselbe Formular noch da, und der
    // zweite Versuch soll nicht davon abhaengen, wo der Fokus liegen geblieben
    // ist. `fill` ist idempotent.
    await seiteM.locator('input#username').fill(MAIL);
    await seiteM.locator('input#password').fill(PASS_START);
    await seiteM.locator('input#password').focus();
    await seiteM.keyboard.press('Enter');
  });
  const wechselDa = await steht(seiteM, '[data-testid="passwort-wechseln"]', 45000);
  pruefe(
    'Anmeldung: die Eingabetaste meldet an',
    wechselDa,
    wechselDa ? `${anmeldungen}. Anmeldung` : await warumNichtAngemeldet(seiteM, ersteAnmeldung)
  );
  if (!wechselDa) {
    await seiteM.screenshot({ path: path.join(ZIEL, '1440-erste-anmeldung.png') }).catch(() => {});
    throw new Error(
      `Die Anmeldung des Mitarbeiters kam nicht durch (HTTP ${ersteAnmeldung.status}). ` +
        'HTTP 429 heisst Anmeldedrossel: zehn je Viertelstunde und IP, das sagt ' +
        'nichts ueber das Geraet.'
    );
  }

  // --- 4. Der Startpasswort-Wechsel, in drei Breiten ------------------------
  //
  // Ob diese Seite kommt, entscheidet EINE Antwort: `GET /api/auth/session`
  // sagt `passwortWechselNoetig`. Bleibt sie aus, zeigt die Oberflaeche die
  // Anmeldung — und das rote Feld sah bis zum 28.08.2026 aus wie eine Aussage
  // ueber diese Ansicht. Deshalb nennt `warum` hier den Wortwechsel selbst.
  for (const breite of BREITEN) {
    const beginn = Date.now();
    await ansichtMessen(seiteM, {
      name: 'Startpasswort-Wechsel',
      dateiname: 'startpasswort',
      breite,
      kennzeichen: '[data-testid="passwort-wechseln"]',
      oeffnen: async () => {
        await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
      warum: async () =>
        [
          authSeit(beginn, '/api/auth/session'),
          `Adresse ${seiteM.url().replace(URL, '')}`,
          `auf dem Schirm: ${await wasStehtDa(seiteM)}`,
        ].join(', '),
    });
  }

  // Enter bestaetigt auch hier: drei Felder, ein Knopf, und die Eingabetaste
  // im letzten Feld sendet ab (implizites Absenden eines `form`).
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await seiteM.locator('#passwort-alt').fill(PASS_START);
  await seiteM.locator('#passwort-neu').fill(PASS_SELBST);
  await seiteM.locator('#passwort-wiederholung').fill(PASS_SELBST);
  const wechselBeginn = Date.now();
  await seiteM.keyboard.press('Enter');
  // Der Wechsel entwertet alle Sitzungen; die Oberflaeche meldet ab und zeigt
  // wieder die Anmeldung.
  const zurueckZurAnmeldung = await steht(seiteM, 'input#username', 45000);
  pruefe(
    'Startpasswort-Wechsel: die Eingabetaste bestaetigt, danach steht die Anmeldung',
    zurueckZurAnmeldung,
    zurueckZurAnmeldung ? '' : await wasStehtDa(seiteM)
  );

  // Der Wechsel entwertet ALLE Sitzungen des Mitarbeiters, und die Oberflaeche
  // ruft danach `POST /api/auth/logout` mit genau dem entwerteten Token. Bis
  // D6 antwortete der Weg darauf mit 401, der Rumpf lief nie, und das
  // httpOnly-Cookie `arasul_session` blieb mit totem Token im Browser stehen --
  // eine Sitzung, die eine Seite selbst nicht loeschen kann, weil sie
  // httpOnly-Cookies nicht sieht. Gemessen wird hier der Browser, nicht die
  // Antwort: was zaehlt, ist, dass nichts liegen bleibt.
  //
  // SEIT DEM 28.08.2026 STEHT DIE ANTWORT TROTZDEM DANEBEN. Einer von vier
  // Laeufen am Orin war genau hier rot, und „arasul_session blieb stehen"
  // liess offen, ob der Weg 403 sagte (CSRF), 429 (Drossel) oder gar nichts
  // (verlorene Anfrage) -- drei Befunde mit drei verschiedenen Antworten. Der
  // Wortwechsel entscheidet das in einer Zeile.
  const { uebrig, tot, gewartet } = await sitzungscookieFaellt(ctxM);
  pruefe(
    'Der Passwortwechsel laesst keine tote Sitzung im Browser zurueck',
    !tot,
    [
      uebrig.map(c => c.name).join(', ') || 'gar keine Cookies',
      authSeit(wechselBeginn, '/api/auth/logout'),
      `nach ${gewartet} ms`,
    ].join(' · ')
  );

  // --- 5. Die zweite Anmeldung ---------------------------------------------
  const zweiteAnmeldung = await anmeldungAbschicken(seiteM, async () => {
    await seiteM.locator('input#username').fill(MAIL);
    await seiteM.locator('input#password').fill(PASS_SELBST);
    await seiteM.locator('button[type="submit"]').click();
  });
  const shellDa = await steht(seiteM, '[data-testid="workspace-shell"]', 60000);
  if (!shellDa) {
    await seiteM.screenshot({ path: path.join(ZIEL, '1440-zweite-anmeldung.png') }).catch(() => {});
  }
  pruefe(
    'Der Mitarbeiter kommt mit dem eigenen Passwort in die Shell',
    shellDa,
    shellDa ? `${anmeldungen}. Anmeldung` : await warumNichtAngemeldet(seiteM, zweiteAnmeldung)
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
    const weg = FLOW_WEG || `/apps/${app}/api/flow?flow=${FLOW}&woche=Abnahme-D7`;
    const start = await mApi
      .post(weg, {
        headers: { 'content-type': 'application/json' },
        data: FLOW_RUMPF ? JSON.parse(FLOW_RUMPF) : {},
        timeout: 60000,
      })
      .catch(fehler => ({ fehler: einzeilig(fehler.message, 90) }));
    // WORAN ES LAG, NICHT NUR DASS ES NICHT GING (Phase G2).
    //
    // Hier stand ein Satz -- „der Flow hat nicht angehalten" -- fuer drei
    // verschiedene Ausgaenge: der Aufruf kam gar nicht durch, er kam durch und
    // antwortete anders als erwartet, oder er lief und der Lauf erreichte nie
    // `wartend`. Am 29.08.2026 uebersprang die Reihe diese Zelle bei jedem
    // Lauf, und der Satz liess offen, ob die App den Weg nicht kennt oder der
    // Flow nicht anhaelt. Das sind zwei verschiedene Befunde.
    let grund = '';
    let lauf = null;
    if (!start || start.fehler) {
      grund = `${weg} kam nicht durch (${start?.fehler ?? 'kein Grund'})`;
    } else if (start.status() !== FLOW_CODE) {
      const rumpf = await start.text().catch(() => '');
      grund = `${weg} antwortete HTTP ${start.status()} statt ${FLOW_CODE}: ${einzeilig(rumpf, 90)}`;
    } else {
      const rumpf = await start.json().catch(() => null);
      lauf = rumpf ? ausAntwort(rumpf, FLOW_FELD) : null;
      // Und WO der Pfad abbrach. Ohne das ist der naechste Schritt raten;
      // damit steht in derselben Zeile, wie ARASUL_FLOW_FELD heissen muss.
      if (!lauf) grund = `die Antwort trug ${FLOW_FELD} nicht: ${pfadEnde(rumpf, FLOW_FELD)}`;
    }
    if (lauf) {
      const ende = Date.now() + 120000;
      while (Date.now() < ende && !anfrage) {
        const offen = await mApi.get('/api/freigabe-anfragen');
        const liste = offen.ok() ? ((await offen.json()).data ?? []) : [];
        anfrage = liste.find(a => String(a.run_id) === String(lauf))?.id ?? null;
        if (!anfrage) await seiteM.waitForTimeout(3000);
      }
      if (!anfrage) grund = `Lauf ${lauf} lief, stand aber in 120 s nie auf „wartend"`;
    }
    await mApi.dispose();
    if (anfrage) {
      console.log(`bereit    Eine offene Freigabe (${anfrage}) wartet auf der Uebersicht`);
    } else {
      ueberspringe(
        'Die Uebersicht mit einer offenen Freigabe',
        `der Flow "${FLOW}" der App ${app} hat nicht angehalten: ${grund}`
      );
    }
  } else if (!app) {
    ueberspringe('Die Uebersicht mit einer offenen Freigabe', 'keine App mit Livestand am Geraet');
  }

  // --- 7. Die Uebersicht, in drei Breiten ----------------------------------
  for (const breite of BREITEN) {
    const ok = await ansichtMessen(seiteM, {
      name: 'Uebersicht',
      dateiname: 'uebersicht',
      breite,
      kennzeichen: '[data-testid="uebersicht-seite"]',
      oeffnen: async () => {
        await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
    });
    if (ok) {
      await aufteilungMessen(seiteM, breite);

      // Die Notizen. Sie werden nie ausgehaengt, sondern nur versteckt (der
      // Zettel speichert nach einer Sekunde Ruhe; ein Unmount waehrend der
      // Pause verloere den Text) -- gefragt wird deshalb, ob das Feld DA ist,
      // und getrennt davon, ob es zu sehen ist.
      //
      // Und genau hier trennen sich die Breiten seit D6: ueber 900 px ist der
      // Zettel eine Spalte und STEHT da, darunter ist er ein Blatt und liegt
      // ZU, solange niemand ihn aufzieht. Beides ist die Regel, nicht ein
      // Mangel; die eigene Zelle „Notizen" weiter unten misst ihn aufgezogen.
      const zettelDa = await seiteM
        .locator('#notizen-feld')
        .first()
        .waitFor({ state: 'attached', timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      const zettelSichtbar = await seiteM
        .locator('#notizen-feld')
        .isVisible()
        .catch(() => false);
      const schmalHier = breite.px < SCHMAL_AB_PX;
      pruefe(
        schmalHier
          ? `${breite.px} px: die Notizen sind gemountet und liegen zu`
          : `${breite.px} px: die Notizen stehen in der rechten Spalte`,
        zettelDa && (schmalHier ? !zettelSichtbar : zettelSichtbar),
        zettelDa ? (zettelSichtbar ? 'sichtbar' : 'da, aber zu') : 'kein #notizen-feld'
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

  // --- 7b. Das Menue und die Notizen bei 390 px ----------------------------
  //
  // Die dreizehnte Zelle, und die einzige, die eine Breite fuer sich hat. Sie
  // gehoert zum ersten Fund der D6-Messung: dass die Notizen bei 390 px die
  // Mitte NICHT mehr verdecken, ist eine halbe Aussage, solange niemand
  // nachsieht, ob man sie dort ueberhaupt noch benutzen kann. Davor steht seit
  // D7 das Hamburger-Menue -- ohne es gibt es unter 900 px gar keinen Weg von
  // einer Ansicht zur naechsten.
  {
    const telefon = BREITEN[0];
    await seiteM.setViewportSize({ width: telefon.px, height: telefon.hoehe });
    await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await steht(seiteM, '[data-testid="uebersicht-seite"]', 30000);

    // --- Das Menue ---------------------------------------------------------
    const menueAuf = await klickFrei(
      seiteM,
      seiteM.locator('[data-testid="workspace-menue-knopf"]')
    );
    const menueDa = menueAuf && (await steht(seiteM, '[data-testid="workspace-schmal-menue"]', 15000));
    pruefe(
      `${telefon.px} px: der Hamburger oeffnet das Menue`,
      menueDa,
      menueAuf ? '' : 'der Klick auf den Hamburger kam nicht durch'
    );
    if (menueDa) {
      await seiteM
        .screenshot({ path: path.join(ZIEL, `${telefon.px}-menue.png`) })
        .catch(() => {});
      // Was drinsteht: der Weg zurueck und die eigenen Apps. Ein Menue ohne
      // die Uebersicht waere unter 900 px eine Sackgasse -- es gibt dort
      // weder Aktivitaetsleiste noch Tab-Leiste, die zurueckfuehrt.
      const zurueck = await seiteM
        .locator('[data-testid="menue-uebersicht"]')
        .count()
        .catch(() => 0);
      const appDa = app
        ? await seiteM
            .locator(`[data-testid="menue-app-${app}-live"]`)
            .count()
            .catch(() => 0)
        : 1;
      pruefe(
        `${telefon.px} px: das Menue fuehrt die Uebersicht und die eigenen Apps`,
        zurueck === 1 && appDa >= 1,
        `Uebersicht ${zurueck}, App ${appDa}`
      );
    }
    await wegRaeumen(seiteM);

    // --- Die Notizen, aufgeschlagen ----------------------------------------
    const ok = await ansichtMessen(seiteM, {
      name: 'Notizen',
      dateiname: 'notizen',
      breite: telefon,
      kennzeichen: '#notizen-feld',
      notizenZu: false,
      oeffnen: async () => {
        await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await steht(seiteM, '[data-testid="uebersicht-seite"]', 30000);
        await seiteM
          .locator('[aria-label="Notizen einblenden"]')
          .first()
          .click({ timeout: 15000 })
          .catch(() => {});
        // UND ETWAS HINEINSCHREIBEN. Zwei Gruende, und beide zaehlen: die
        // Frage dieser Zelle ist, ob der Zettel bei 390 px BENUTZBAR ist, und
        // ein leeres Feld beantwortet sie nicht. Dazu misst `ansichtMessen`,
        // ob etwas dasteht -- und seit D7 verdeckt der Zettel die Mitte nicht
        // mehr, sondern steht an ihrer Stelle: was hinter ihm lag, zaehlt
        // nicht mehr mit. Der Text gehoert dem Wegwerf-Mitarbeiter und geht
        // mit ihm.
        await seiteM
          .locator('#notizen-feld')
          .fill('Abnahme D7: der Zettel steht bei 390 px als eigene Ansicht und nimmt Text an.')
          .catch(() => {});
      },
    });
    if (ok) {
      // NICHTS LIEGT UEBEREINANDER, und das ist die Regel aus D7. Bis dahin
      // lagen die Notizen als Blatt UEBER der Mitte: sie nahmen ihr die Pixel
      // nicht mehr weg, verdeckten sie aber weiter, und der zweite D6-Lauf am
      // Orin zeigte die App abgedunkelt dahinter. Gefragt wird deshalb nach
      // BEIDEN: der Zettel nimmt die ganze Breite, und die Mitte ist in
      // derselben Sekunde nicht da.
      const spalte = await seiteM.evaluate(() => {
        const zettel = document.querySelector('[data-panel]#right');
        const mitte = document.querySelector('[data-panel]#main');
        if (!zettel) return null;
        const kasten = zettel.getBoundingClientRect();
        return {
          links: Math.round(kasten.left),
          breite: Math.round(kasten.width),
          fenster: window.innerWidth,
          mitteDa: Boolean(mitte) && mitte.getAttribute('data-shell-hidden') === 'false',
        };
      });
      pruefe(
        `${telefon.px} px: die Notizen sind eine eigene Ansicht ueber die ganze Breite`,
        spalte !== null &&
          !spalte.mitteDa &&
          spalte.links <= 1 &&
          spalte.breite >= spalte.fenster - 1,
        spalte
          ? `links ${spalte.links}, breit ${spalte.breite} von ${spalte.fenster}, ` +
              `Mitte ${spalte.mitteDa ? 'AUCH DA' : 'weg'}`
          : 'kein Panel'
      );

      // Und eine Ansicht macht sie wieder zu. Ohne diese Regel bliebe der
      // Zettel der Zustand, in dem der naechste Bildschirm gemessen wuerde --
      // genau das, was in der ersten D6-Messung sieben Ansichten rot machte.
      //
      // Gemessen wird sie IM LAUFENDEN Bildschirm und nicht ueber die Adresse:
      // ein Neuladen macht den Zettel ohnehin zu (der Zustand ist absichtlich
      // nicht gespeichert), und diese Zeile pruefte dann nichts.
      //
      // UEBER DAS MENUE UND DIE UEBERSICHT, nicht ueber einen zweiten Tab.
      // Bis D6 klickte diese Probe auf einen zweiten Tab, den sie sich vorher
      // ueber eine App-Kachel besorgen musste -- eine Vorbereitung, die zwei
      // von drei Laeufen am Orin abgebrochen hat, und ein Weg, den es unter
      // 900 px gar nicht mehr gibt (dort ist keine Tab-Leiste). Ein
      // Mitarbeiter mit EINER App hat genau einen Weg von hier weg, und den
      // misst diese Zeile: Menue auf, Uebersicht.
      const auf = await seiteM
        .locator('[data-testid="workspace-menue-knopf"]')
        .first()
        .click({ timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      const gewechselt =
        auf &&
        (await seiteM
          .locator('[data-testid="menue-uebersicht"]')
          .first()
          .click({ timeout: 15000 })
          .then(() => true)
          .catch(() => false));
      await seiteM.waitForTimeout(1500);
      const wiederZu = await seiteM
        .locator('#notizen-feld')
        .isVisible()
        .catch(() => false);
      const uebersichtDa = await steht(seiteM, '[data-testid="uebersicht-seite"]', 15000);
      pruefe(
        `${telefon.px} px: eine Ansicht aus dem Menue macht die Notizen wieder zu`,
        gewechselt && !wiederZu && uebersichtDa,
        gewechselt
          ? `Notizen ${wiederZu ? 'OFFEN' : 'zu'}, Uebersicht ${uebersichtDa ? 'da' : 'FEHLT'}`
          : 'der Weg ueber das Menue kam nicht durch'
      );
    }

    // Was auch immer hier passiert ist: ueber der naechsten Station liegt
    // nichts mehr. Die folgenden Ansichten kommen zwar ueber die Adresse und
    // laden neu, aber diese Zeile haengt nicht davon ab, dass das so bleibt.
    await wegRaeumen(seiteM);
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
          await laden(seiteM,`${URL}/workspace/app/${app}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
        },
      });
    }
  } else {
    ueberspringe('Die App im Rahmen', 'keine App mit Livestand am Geraet');
  }

  // --- 9. Die Tastatur durch die Shell --------------------------------------
  // Von ganz oben: Kopfleiste, Aktivitaetsleiste, Sidebar, Mitte, Notizen,
  // Statusleiste -- in dieser Reihenfolge steht es im Dokument, und in dieser
  // Reihenfolge soll der Fokus laufen. Ein Halt in einer eingeklappten Spalte
  // oder in einem versteckten Tab springt zurueck und faellt hier auf.
  await seiteM.setViewportSize({ width: 1440, height: 900 });
  await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await laden(seiteM,`${URL}/workspace/settings`, {
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
  await laden(seiteM,`${URL}/dokumente`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await laden(seiteM,URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await laden(seiteM,`${URL}/workspace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shellFuersAbmelden = await steht(seiteM, '[data-testid="workspace-shell"]', 45000);
  if (shellFuersAbmelden) {
    const menueAuf = await klickFrei(
      seiteM,
      seiteM.locator('[data-testid="workspace-benutzermenue"]')
    );
    const menue = menueAuf && (await steht(seiteM, '[data-testid="workspace-abmelden"]', 15000));
    pruefe(
      'Das Benutzermenue der Kopfleiste geht auf',
      menue,
      menueAuf ? '' : 'der Klick auf das Benutzermenue kam nicht durch'
    );
    if (menue) {
      await seiteM.screenshot({ path: path.join(ZIEL, '1440-benutzermenue.png') }).catch(() => {});
      const geklickt = await klickFrei(
        seiteM,
        seiteM.locator('[data-testid="workspace-abmelden"]')
      );
      pruefe(
        'Abmelden fuehrt zurueck auf die Anmeldung',
        geklickt && (await steht(seiteM, 'input#username', 30000)),
        geklickt ? '' : 'der Klick auf Abmelden kam nicht durch'
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
          await laden(seiteA,`${URL}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await laden(seiteA,`${URL}/workspace/settings?tab=security`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await steht(seiteA, '[data-testid="sicherheit-seite"]', 30000);
  const zertKnopf = seiteA.getByRole('button', { name: /Zertifikat herunterladen/ });
  if (await zertKnopf.count()) {
    const [ladung] = await Promise.all([
      seiteA.waitForEvent('download', { timeout: 45000 }).catch(() => null),
      klickFrei(seiteA, zertKnopf, 45000),
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
  await laden(seiteA,`${URL}/workspace/settings?tab=benutzer`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await steht(seiteA, '[data-testid="mitarbeiter-seite"]', 30000);
  const anlegenAuf = await klickFrei(
    seiteA,
    seiteA.locator('[data-testid="mitarbeiter-anlegen-oeffnen"]')
  );
  const dialogDa = anlegenAuf && (await steht(seiteA, '#neu-username', 20000));
  pruefe(
    'Der Dialog zum Anlegen geht auf',
    dialogDa,
    anlegenAuf ? '' : 'der Klick auf „Mitarbeiter anlegen" kam nicht durch'
  );
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
  `${ergebnisse.length - rot} von ${ergebnisse.length} gruen, ${anmeldungen} Anmeldung(en), ${drosselBilanz()}`
);
console.log(`Bilder unter ${path.relative(WURZEL, ZIEL)}/`);
process.exit(rot === 0 ? 0 : 1);
