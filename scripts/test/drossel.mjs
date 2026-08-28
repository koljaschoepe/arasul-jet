/**
 * Die Drosseln des Geraets, aus Sicht einer Abnahme -- EINE Sache.
 *
 * Bis zum 28.08.2026 wusste `oberflaeche-abnahme.mjs` von genau einer
 * Drossel, der Anmeldedrossel (`loginLimiter`, zehn je Viertelstunde und IP):
 * sie merkte sich deren Kopfzeilen, wartete vor der Anmeldung und wiederholte
 * ein 429 am Formular einmal. Das Geraet hat aber mehr als eine auf den
 * Wegen, die jede Seitenladung nimmt (`middleware/rateLimit.js`):
 *
 *   anmeldung   POST /api/auth/login, /setup        10 je 15 min   loginLimiter
 *   probe       GET  /api/auth/session,             120 je 60 s    probeLimiter
 *               GET  /api/auth/needs-setup
 *   auth        POST /api/auth/logout               30 je 60 s     generalAuthLimiter
 *
 * EINE SEITENLADUNG KOSTET ZWEI AUS `probe` und sonst nichts: die
 * Sitzungsprobe (`checkAuth`) und die Frage nach dem ersten Administrator
 * (App.tsx, beim Einhaengen). Ein Abmelden kostet eine aus `auth`.
 *
 * WARUM DAS SEIT DEM 28.08.2026 SO GESCHNITTEN IST. Die erste Fassung dieser
 * Datei kannte drei Drosseln und `needs-setup` sass bei den dreissig je
 * Minute. GEMESSEN am Orin, ein Lauf der Oberflaechen-Abnahme: 44
 * Seitenladungen in 129 s, in der vollsten Minute 22 von 30 auf jener Drossel
 * und 21 von 120 auf der Sitzungsprobe. Die enge war also nie die, auf die
 * die Abnahmen geschaut haben -- ein Lauf fuhr auf 73 Prozent einer Drossel,
 * die er sich mit dem Abmelden teilte, und neben irgendetwas anderem wurde er
 * rot. Seither tragen beide Proben dieselbe Drossel (`probeLimiter`), und die
 * dreissig je Minute gehoeren dem, wofuer sie da sind: einer Mutation.
 *
 * Die Drosseln zaehlen je IP, und hinter Traefik (`trustProxy: false`) ist das
 * EINE IP fuer alles, was am Geraet anklopft: die Reihe, der Ueberordner
 * daneben, ein Mensch im Browser. Eine Buchfuehrung, die nur die eigenen
 * Anfragen kennt, kann deshalb nie vollstaendig sein -- deshalb WARTET diese
 * Datei nicht nur vorher, sie sagt dem Aufrufer auch, wenn trotzdem ein 429
 * gekommen ist (`drossel429Stand`, `drossel429Seit`), damit er den Handgriff
 * wiederholen kann statt rot zu werden.
 *
 * Der Stand je Drossel steht aus den Kopfzeilen JEDER Antwort, die eine
 * traegt (`express-rate-limit` schreibt `RateLimit-Remaining` und
 * `RateLimit-Reset` an jede, `Retry-After` an die 429), in EINER Datei, damit
 * der naechste Lauf ihn kennt. Das Gegenstueck fuer die curl-Abnahmen steht
 * in `anmeldung.sh` und liest und schreibt dieselbe Datei.
 *
 * DIE DATEI. JSON, je Drossel ein Eintrag:
 *   { "anmeldung": { "rest": 7, "reset": 1756400000000 }, "probe": {...} }
 * `reset` ist ein Zeitpunkt (ms seit 1970), kein Abstand -- der Abstand aus
 * der Kopfzeile gilt nur im Augenblick der Antwort. Die Fassung vor dem
 * 28.08.2026 schrieb einen einzigen flachen Eintrag `{rest, reset}`; der wird
 * als `anmeldung` gelesen.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DROSSEL_DATEI =
  process.env.ARASUL_DROSSEL_DATEI || path.join(os.tmpdir(), 'arasul-abnahme-drossel');

/** Was das Geraet drosselt, und woran eine Abnahme den Weg erkennt. */
export const DROSSELN = {
  anmeldung: {
    grenze: 10,
    fensterMs: 15 * 60 * 1000,
    wort: 'zehn Anmeldungen je Viertelstunde und IP',
    trifft: (methode, pfad) =>
      methode === 'POST' && (pfad === '/api/auth/login' || pfad === '/api/auth/setup'),
  },
  probe: {
    grenze: 120,
    fensterMs: 60 * 1000,
    wort: 'hundertzwanzig Proben je Minute und IP (session, needs-setup)',
    trifft: (methode, pfad) =>
      methode === 'GET' && (pfad === '/api/auth/session' || pfad === '/api/auth/needs-setup'),
  },
  auth: {
    grenze: 30,
    fensterMs: 60 * 1000,
    wort: 'dreissig Abmeldungen je Minute und IP',
    trifft: (methode, pfad) => methode === 'POST' && pfad === '/api/auth/logout',
  },
};

/** Laenger als das laengste Fenster wartet niemand. */
const LAENGSTES_FENSTER_MS = Math.max(...Object.values(DROSSELN).map(d => d.fensterMs));

/** Welche Drossel dieser Weg traegt -- oder null. */
export function drosselFuer(methode, pfad) {
  for (const [name, d] of Object.entries(DROSSELN)) {
    if (d.trifft(String(methode).toUpperCase(), pfad)) return name;
  }
  return null;
}

/**
 * Was die Antwort ueber ihre Drossel verraet.
 *
 * `express-rate-limit` schreibt seine Zahlen je nach Entwurf in zwei Formen:
 * als eigene Kopfzeilen (`RateLimit-Remaining`, `RateLimit-Reset`) oder
 * gebuendelt in einer (`RateLimit: limit=10, remaining=9, reset=880`), dazu
 * `Retry-After` an der 429-Antwort. Gelesen werden alle drei -- sonst haengt
 * die Abnahme an der Fassung eines Pakets im Backend, und das waere eine
 * Aussage ueber den Messaufbau, die wie eine ueber das Geraet aussieht.
 */
export function drosselAusKopfzeilen(kopf) {
  const klein = {};
  for (const [k, v] of Object.entries(kopf || {})) klein[k.toLowerCase()] = v;
  const zahl = wert => {
    const n = Number(wert);
    return Number.isFinite(n) ? n : null;
  };
  const gebuendelt = klein['ratelimit'] || '';
  const rest =
    zahl(klein['ratelimit-remaining']) ?? zahl(/remaining=(\d+)/.exec(gebuendelt)?.[1]);
  const inSekunden =
    zahl(klein['ratelimit-reset']) ??
    zahl(/reset=(\d+)/.exec(gebuendelt)?.[1]) ??
    zahl(klein['retry-after']);
  if (rest === null && inSekunden === null) return null;
  return { rest: rest ?? 0, reset: Date.now() + (inSekunden ?? 0) * 1000 };
}

/** Der ganze Stand aus der Datei; leer, wenn es keine gibt. */
export function drosselLesen() {
  try {
    const roh = JSON.parse(fs.readFileSync(DROSSEL_DATEI, 'utf-8'));
    if (roh && typeof roh === 'object' && 'reset' in roh && !('anmeldung' in roh)) {
      return { anmeldung: { rest: Number(roh.rest ?? 0), reset: Number(roh.reset ?? 0) } };
    }
    return roh && typeof roh === 'object' ? roh : {};
  } catch {
    return {};
  }
}

/**
 * Den Stand einer Drossel festhalten -- aus der Antwort eines Weges, der sie
 * traegt. Gibt zurueck, was gemerkt wurde, oder null, wenn der Weg keine
 * Drossel traegt oder die Antwort nichts sagt.
 *
 * Ein 429 ohne Zahlen (das kommt vor, wenn ein Proxy die Kopfzeilen
 * verschluckt) wird als „nichts mehr uebrig, ein Fenster lang" gemerkt: lieber
 * einmal zu lange warten als denselben 429 gleich noch einmal.
 */
export function drosselMerken(methode, pfad, kopf, status = 200) {
  const name = drosselFuer(methode, pfad);
  if (!name) return null;
  let stand = drosselAusKopfzeilen(kopf);
  if (!stand && status === 429) {
    stand = { rest: 0, reset: Date.now() + DROSSELN[name].fensterMs };
  }
  if (status === 429) gedrosselt[name] = (gedrosselt[name] ?? 0) + 1;
  if (!stand) return null;
  if (status === 429) stand.rest = 0;
  engpass[name] = Math.min(engpass[name] ?? Number.POSITIVE_INFINITY, stand.rest);
  const alles = drosselLesen();
  alles[name] = stand;
  try {
    fs.writeFileSync(DROSSEL_DATEI, JSON.stringify(alles), { mode: 0o600 });
  } catch {
    /* nicht schreibbar -- dann faengt der naechste 429 es eben allein ab */
  }
  return { name, ...stand };
}

/**
 * Wie oft eine Drossel in DIESEM Lauf schon 429 gesagt hat, je Drossel.
 *
 * Die Buchfuehrung aus den Kopfzeilen kann nie vollstaendig sein -- hinter
 * Traefik teilen sich alle dieselbe IP, und wer sonst noch anklopft, taucht
 * darin nicht auf. Ein Handgriff, der schiefging, WAEHREND eine Drossel 429
 * gesagt hat, ist deshalb keine Aussage ueber das Geraet, sondern eine ueber
 * den Messaufbau; der Aufrufer vergleicht den Stand vorher und nachher und
 * wiederholt, statt rot zu werden.
 */
const gedrosselt = {};

/** Der kleinste Rest, den eine Drossel in diesem Lauf gezeigt hat. */
const engpass = {};

/** Der Zaehlerstand, um ihn spaeter mit `drossel429Seit` zu vergleichen. */
export function drossel429Stand() {
  return { ...gedrosselt };
}

/** Welche Drossel seit `vorher` 429 gesagt hat -- oder null. */
export function drossel429Seit(vorher) {
  for (const name of Object.keys(DROSSELN)) {
    if ((gedrosselt[name] ?? 0) > (vorher[name] ?? 0)) return name;
  }
  return null;
}

/** Wie lange (ms) eine Drossel noch zu ist, wenn `brauche` Versuche fehlen. 0 = frei. */
export function drosselRestzeit(name, brauche = 1) {
  const stand = drosselLesen()[name];
  if (!stand) return 0;
  const bleibt = Number(stand.reset ?? 0) - Date.now();
  if (!(bleibt > 0) || Number(stand.rest ?? 0) >= brauche) return 0;
  return Math.min(bleibt + 1000, DROSSELN[name]?.fensterMs ?? LAENGSTES_FENSTER_MS);
}

/**
 * Wie lange nach einem 429 gewartet wird: was die Drossel sagt, mindestens
 * fuenf Sekunden, hoechstens ein Fenster. Eine Antwort ohne brauchbare Zahl
 * darf weder sofort wieder anklopfen noch ewig liegen.
 */
export function drosselNochmalNach(name) {
  return Math.min(Math.max(drosselRestzeit(name, 1) + 1000, 5000), DROSSELN[name].fensterMs);
}

/** Was insgesamt gewartet wurde, je Drossel -- fuer die letzte Zeile eines Laufs. */
export const gewartet = {};

/** Die Wartezeit laut aussprechen: ein stiller Lauf sieht aus wie ein haengender. */
export async function drosselSchlafen(name, ms) {
  const s = Math.ceil(ms / 1000);
  console.log(`warte  ${s} s auf die Drossel „${name}" (${DROSSELN[name]?.wort ?? name})`);
  gewartet[name] = (gewartet[name] ?? 0) + s;
  await new Promise(fertig => setTimeout(fertig, ms));
}

/**
 * Warten, statt rot zu werden: bis die Drossel `name` wieder `brauche`
 * Versuche hergibt. Gefragt wird aus dem, was die letzte Antwort gesagt hat;
 * irrt sich das, weil jemand anders dazwischen war, faengt der 429 danach es
 * ab -- der Aufrufer merkt ihn und fragt hier noch einmal.
 */
export async function drosselAbwarten(name, brauche = 1) {
  const ms = drosselRestzeit(name, brauche);
  if (ms > 0) await drosselSchlafen(name, ms);
}

/**
 * Vor einer Seitenladung: sie kostet ZWEI aus `probe` (die Sitzungsprobe und
 * die Frage nach dem ersten Administrator), und danach kommt oft gleich die
 * naechste. Gewartet wird deshalb, bis fuer ZWEI Ladungen Platz ist -- eine
 * Reihe, die auf der Kante faehrt, misst sonst bei jeder zweiten Zelle die
 * Drossel statt der Ansicht. `auth` traegt seit dem 28.08.2026 nur noch das
 * Abmelden und wird von einer Seitenladung nicht angefasst.
 */
export async function seitenladungAbwarten() {
  await drosselAbwarten('probe', 4);
}

/**
 * Eine Zeile fuer das Ende eines Laufs: was die Drossel gekostet hat -- und
 * WIE KNAPP es war.
 *
 * Der kleinste Rest ist die Zahl, die den 28.08.2026 gekostet hat: die Reihe
 * fuhr auf 22 von 30 und sagte darueber nichts, und die roten Felder sahen
 * aus wie Aussagen ueber das Geraet. Wer sie liest, sieht in einer Zeile, ob
 * der naechste Lauf Luft hat.
 */
export function drosselBilanz() {
  const eng = Object.entries(engpass)
    .map(([n, r]) => `${n} ${r} von ${DROSSELN[n]?.grenze ?? '?'}`)
    .join(', ');
  const teile = Object.entries(gewartet).map(([n, s]) => `${s} s auf „${n}"`);
  const warten = teile.length ? `gewartet: ${teile.join(', ')}` : 'nie auf eine Drossel gewartet';
  return eng ? `${warten}; kleinster Rest ${eng}` : warten;
}
