/**
 * Skill-Werkzeuge für die Web-Recherche (Plan 011, Schritt 8).
 *
 * Zwei Werkzeuge, getrennt wie bei den Dateien: `web_suche` findet Adressen,
 * `web_lesen` holt eine davon. Ein Skill kann suchen dürfen, ohne beliebige
 * Seiten abrufen zu dürfen.
 *
 * Kein Browser, kein JavaScript, keine Klickpfade (§8). Abgerufen wird der
 * rohe HTML-Text, daraus wird lesbarer Fließtext gemacht und hart gekürzt.
 * Die Kürzung ist der eigentliche Zweck: Eine vollständige Nachrichtenseite
 * sprengt den Kontext eines 7B-Modells, lange bevor sie ihm nützt.
 *
 * SICHERHEITSGRENZE (Zusatz gegenüber dem Plan). Das Backend hängt im internen
 * Netz und erreicht Postgres, MinIO, Qdrant und den Docker-Proxy. Ein Werkzeug,
 * das eine beliebige Adresse abruft, wäre damit ein Weg, aus einem Skill heraus
 * genau diese Dienste anzusprechen — der Skill müsste dafür nur
 * `http://postgres-db:5432` als "Webseite" angeben. Das hat nichts mit dem
 * bewusst fehlenden Rechtekonzept zu tun (§8): Der Nutzer will Zugriff auf das
 * WEB, nicht auf das Innere seines eigenen Stacks über einen Umweg, der wie
 * eine Recherche aussieht. Deshalb werden private, lokale und Link-Local-
 * Adressen abgewiesen — auch nach jeder Weiterleitung neu geprüft.
 */

const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const axios = require('axios');
const BaseTool = require('../../../tools/baseTool');
const logger = require('../../../utils/logger');

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://searxng:8080';
const SUCHE_TIMEOUT_MS = Number(process.env.WEB_SUCHE_TIMEOUT_MS) || 15000;
const LESEN_TIMEOUT_MS = Number(process.env.WEB_LESEN_TIMEOUT_MS) || 20000;

const DEFAULT_TREFFER = 5;
const MAX_TREFFER = 10;
const AUSZUG_ZEICHEN = 300;

const MAX_TEXT_ZEICHEN = 8000;
const MAX_DOWNLOAD_BYTES = 3 * 1024 * 1024; // 3 MB rohes HTML
const MAX_WEITERLEITUNGEN = 3;

const USER_AGENT = 'Arasul/1.0 (+lokale Recherche; kein Crawler)';

/* ------------------------------------------------------------------ Adressen */

/**
 * Zerlegt eine IPv6-Adresse in ihre 8 Gruppen (Zahlen 0–65535).
 *
 * Das Ausschreiben ist hier keine Formalie, sondern der Kern der Prüfung:
 * Dieselbe Adresse lässt sich auf viele Arten schreiben — `::ffff:127.0.0.1`,
 * `0:0:0:0:0:ffff:7f00:1`, `::ffff:7f00:1`, `::127.0.0.1`. Wer nur die eine
 * hübsche Schreibweise per Muster erkennt, lässt alle anderen durch.
 *
 * @returns {number[]|null} 8 Gruppen, oder null wenn nicht auswertbar.
 */
function ipv6Gruppen(ip) {
  let rest = ip.toLowerCase().split('%')[0]; // Zonen-Index abschneiden
  let v4Schwanz = null;

  // Eingebettete IPv4-Schreibweise am Ende (::ffff:1.2.3.4 oder ::1.2.3.4)
  const m = rest.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (m) {
    const t = m[2].split('.').map(Number);
    if (t.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    v4Schwanz = [(t[0] << 8) | t[1], (t[2] << 8) | t[3]];
    rest = m[1].slice(0, -1); // den Doppelpunkt vor der IPv4 entfernen
    if (rest === '') {
      rest = ':';
    }
  }

  const teile = rest.split('::');
  if (teile.length > 2) {
    return null;
  }
  const zuZahlen = s =>
    s
      .split(':')
      .filter(x => x !== '')
      .map(x => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));

  const kopf = zuZahlen(teile[0] || '');
  let schwanz = teile.length === 2 ? zuZahlen(teile[1] || '') : [];
  if (v4Schwanz) {
    schwanz = schwanz.concat(v4Schwanz);
  }
  if ([...kopf, ...schwanz].some(Number.isNaN)) {
    return null;
  }

  if (teile.length === 2) {
    const fehlend = 8 - kopf.length - schwanz.length;
    if (fehlend < 0) {
      return null;
    }
    return [...kopf, ...Array(fehlend).fill(0), ...schwanz];
  }
  return kopf.length === 8 ? kopf : null;
}

/**
 * Ist die IP privat, lokal oder sonst nicht öffentlich?
 *
 * Deckt IPv4 und IPv6 ab. IPv6 wird zuerst ausgeschrieben (siehe
 * `ipv6Gruppen`) — eine Prüfung auf der Zeichenkette wäre über eine andere
 * Schreibweise derselben Adresse trivial zu umgehen.
 */
function istPrivateIp(ip) {
  const art = net.isIP(ip);
  if (!art) {
    return true; // nicht auswertbar → nicht durchlassen
  }

  let v4 = ip;
  if (art === 6) {
    const g = ipv6Gruppen(ip);
    if (!g) {
      return true; // fail closed
    }
    const nullPrefix = g.slice(0, 5).every(x => x === 0);
    if (nullPrefix && g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) {
      return true; // :: und ::1
    }
    // IPv4-mapped (::ffff:a.b.c.d) und IPv4-compatible (::a.b.c.d):
    // beide sind nur eine Verkleidung fuer eine IPv4-Adresse.
    if (nullPrefix && (g[5] === 0xffff || g[5] === 0)) {
      const a = g[6] >> 8;
      const b = g[6] & 0xff;
      const c = g[7] >> 8;
      const d = g[7] & 0xff;
      v4 = `${a}.${b}.${c}.${d}`;
    } else {
      // Unique Local (fc00::/7) und Link-Local (fe80::/10)
      const erste = g[0];
      if ((erste & 0xfe00) === 0xfc00 || (erste & 0xffc0) === 0xfe80) {
        return true;
      }
      return false;
    }
  }

  const t = v4.split('.').map(Number);
  if (t.length !== 4 || t.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = t;
  return (
    a === 0 || // "dieses Netz"
    a === 10 ||
    a === 127 || // Loopback
    (a === 100 && b >= 64 && b <= 127) || // Carrier-Grade NAT
    (a === 169 && b === 254) || // Link-Local, u. a. Cloud-Metadaten
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // Benchmark-Netz
    a >= 224 // Multicast und reserviert
  );
}

/**
 * Prüft eine Adresse: Schema, Form und — nach Namensauflösung — dass sie
 * wirklich nach draußen zeigt.
 *
 * Gibt die geprüfte IP MIT zurück, und das ist wesentlich: Der Abruf muss
 * genau diese Adresse verwenden. Würde nur der Name weitergereicht, löste
 * Node ihn beim Verbinden ein zweites Mal auf — und zwischen Prüfung und
 * Verbindung kann dieselbe Anfrage eine andere Antwort bekommen
 * (kurze TTL, wechselnde Antwort, eigener Nameserver). Genau das ist
 * DNS-Rebinding: geprüft wird eine öffentliche Adresse, verbunden wird
 * mit einer internen. Siehe `festgenagelterAgent`.
 *
 * @returns {Promise<{ok:true, url:URL, ip:string}|{ok:false, grund:string}>}
 */
async function pruefeAdresse(roh) {
  let url;
  try {
    url = new URL(String(roh).trim());
  } catch {
    return { ok: false, grund: `"${roh}" ist keine gültige Adresse.` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, grund: `Nur http und https sind erlaubt, nicht "${url.protocol}".` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    return istPrivateIp(host)
      ? { ok: false, grund: `Die Adresse zeigt auf ein internes Netz (${host}) — abgewiesen.` }
      : { ok: true, url, ip: host };
  }

  let adressen;
  try {
    adressen = await dns.lookup(host, { all: true });
  } catch {
    return { ok: false, grund: `Der Name "${host}" konnte nicht aufgelöst werden.` };
  }
  if (adressen.length === 0) {
    return { ok: false, grund: `Der Name "${host}" hat keine Adresse.` };
  }
  // ALLE aufgelösten Adressen müssen öffentlich sein. Eine einzige interne
  // genügt, um abzulehnen — sonst entscheidet der Zufall der Sortierung.
  const intern = adressen.find(a => istPrivateIp(a.address));
  if (intern) {
    return {
      ok: false,
      grund: `"${host}" zeigt auf ein internes Netz (${intern.address}) — abgewiesen.`,
    };
  }
  return { ok: true, url, ip: adressen[0].address };
}

/**
 * Baut einen HTTP(S)-Agenten, der AUSSCHLIESSLICH zur geprüften IP verbindet.
 *
 * Die Namensauflösung ist damit einmalig: Was `pruefeAdresse` freigegeben hat,
 * ist auch das, womit verbunden wird. Ohne das bliebe zwischen Prüfung und
 * Verbindung ein Zeitfenster, in dem derselbe Name plötzlich auf eine interne
 * Adresse zeigt (DNS-Rebinding) — die ganze Prüfung wäre dann Zierde.
 *
 * Der HOSTNAME bleibt unangetastet: Host-Kopf, SNI und Zertifikatsprüfung
 * laufen weiter über den Namen. Festgenagelt wird nur, wohin die Verbindung geht.
 */
function festgenagelterAgent(protokoll, ip) {
  const lookup = (hostname, optionen, rueckruf) => {
    const cb = typeof optionen === 'function' ? optionen : rueckruf;
    const opts = typeof optionen === 'function' ? {} : optionen || {};
    const familie = net.isIPv6(ip) ? 6 : 4;
    if (opts.all) {
      return cb(null, [{ address: ip, family: familie }]);
    }
    return cb(null, ip, familie);
  };
  return protokoll === 'https:'
    ? new https.Agent({ lookup, keepAlive: false })
    : new http.Agent({ lookup, keepAlive: false });
}

/* --------------------------------------------------------------------- HTML */

/** Entschlüsselt die HTML-Entitäten, die in Fließtext tatsächlich vorkommen. */
function entitaeten(text) {
  return text
    .replace(/&(#\d+|#x[0-9a-f]+);/gi, (_, code) => {
      const nr =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(nr) && nr > 0 && nr < 0x110000 ? String.fromCodePoint(nr) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&'); // zuletzt, sonst entstehen neue Entitäten
}

/**
 * Entfernt HTML-Tags — und zwar mit Blick auf ANFÜHRUNGSZEICHEN.
 *
 * Der naheliegende Weg (`/<[^>]+>/g`) endet am ersten `>`. Steht ein `>`
 * innerhalb eines Attributwertes, gilt das Tag dort fälschlich als beendet und
 * der Rest landet als Text in der Ausgabe. Das ist kein Randfall: Wikipedia
 * transportiert in `data-parsoid` ganze HTML-Schnipsel in Attributen — auf dem
 * Gerät gemessen blieben so 34 Markup-Fragmente in einem einzigen Artikel
 * stehen. Genau die Sorte Müll, die der Kontext-Deckel eigentlich fernhalten
 * soll.
 *
 * Bewusst ein Durchlauf von Hand statt eines schlaueren Musters: Der Scanner
 * läuft linear durch die Zeichenkette, kennt also kein Zurücksetzen und kann
 * an bösartiger Eingabe nicht in exponentielle Laufzeit geraten (ReDoS).
 */
function tagsEntfernen(html) {
  let aus = '';
  let i = 0;
  while (i < html.length) {
    const auf = html.indexOf('<', i);
    if (auf === -1) {
      aus += html.slice(i);
      break;
    }
    aus += html.slice(i, auf);

    let j = auf + 1;
    let quote = null;
    let geschlossen = false;
    while (j < html.length) {
      const c = html[j];
      if (quote) {
        if (c === quote) {
          quote = null;
        }
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        geschlossen = true;
        break;
      }
      j += 1;
    }
    if (!geschlossen) {
      // Unabgeschlossenes Tag am Ende: alles ab hier verwerfen, statt rohes
      // Markup durchzureichen.
      break;
    }
    aus += ' ';
    i = j + 1;
  }
  return aus;
}

/**
 * Macht aus HTML lesbaren Text.
 *
 * BEWUSST kein HTML-Parser (kein cheerio/jsdom): Das wäre eine weitere
 * Abhängigkeit für eine Aufgabe, deren Ergebnis ohnehin auf 8000 Zeichen
 * gekürzt wird. Das hier ist eine Heuristik, kein Parser — sie wirft die
 * groben Blöcke weg (Skripte, Stile, Navigation, Fußzeilen) und macht aus dem
 * Rest Fließtext. Bei kaputtem oder verschachteltem HTML bleibt gelegentlich
 * Rauschen stehen; für die Frage "worum geht es auf dieser Seite" reicht das,
 * für exaktes Auslesen einzelner Felder nicht.
 */
function htmlZuText(html) {
  let t = String(html);

  // Blöcke, die nie Inhalt sind — samt Inhalt entfernen.
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of [
    'script',
    'style',
    'noscript',
    'svg',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'iframe',
  ]) {
    t = t.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }

  const titel = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];

  // Blockgrenzen in Zeilenumbrüche verwandeln, bevor alle Tags fallen —
  // sonst klebt die ganze Seite zu einem einzigen Absatz zusammen.
  t = t.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = tagsEntfernen(t);

  t = entitaeten(t);
  t = t
    // \u00a0 ist das geschuetzte Leerzeichen — auf Webseiten allgegenwaertig,
    // als Escape geschrieben, weil es als Literal unsichtbar waere.
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { titel: titel ? entitaeten(titel).replace(/\s+/g, ' ').trim() : null, text: t };
}

/* ----------------------------------------------------------------- Werkzeuge */

class WebSucheTool extends BaseTool {
  get name() {
    return 'web_suche';
  }

  get description() {
    return 'Sucht im Web und gibt Titel, Adresse und einen kurzen Auszug je Treffer zurück';
  }

  get parameters() {
    return {
      suchbegriff: {
        type: 'string',
        description: 'Wonach gesucht werden soll',
        required: true,
      },
      anzahl: {
        type: 'number',
        description: `Wie viele Treffer höchstens (Standard ${DEFAULT_TREFFER}, max ${MAX_TREFFER})`,
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const frage = String(params.suchbegriff || '').trim();
    if (!frage) {
      return 'Fehler: "suchbegriff" darf nicht leer sein.';
    }

    let anzahl = Number.parseInt(params.anzahl, 10);
    if (!Number.isFinite(anzahl) || anzahl < 1) {
      anzahl = DEFAULT_TREFFER;
    }
    anzahl = Math.min(anzahl, MAX_TREFFER);

    let daten;
    try {
      const antwort = await axios.get(`${SEARXNG_URL}/search`, {
        params: { q: frage, format: 'json', language: 'de', safesearch: 0 },
        timeout: SUCHE_TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT },
        // Nichts weiterverfolgen: SearXNG antwortet direkt.
        maxRedirects: 0,
        validateStatus: s => s === 200,
      });
      daten = antwort.data;
    } catch (err) {
      // Der haeufigste echte Fehler ist eine 403, weil das JSON-Format in
      // settings.yml fehlt. Das explizit sagen — sonst sucht man lange.
      if (err.response && err.response.status === 403) {
        logger.warn('web_suche: SearXNG lieferte 403 — ist "json" in search.formats aktiviert?');
        return 'Suche nicht möglich: Die Suchmaschine lehnt JSON-Abfragen ab (Konfiguration search.formats).';
      }
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        return 'Suche nicht möglich: Der Suchdienst ist nicht erreichbar.';
      }
      logger.warn(`web_suche fehlgeschlagen: ${err.message}`);
      return `Suche derzeit nicht möglich: ${err.message}`;
    }

    const treffer = Array.isArray(daten && daten.results) ? daten.results : [];
    if (treffer.length === 0) {
      return `Keine Treffer für "${frage}".`;
    }

    const zeilen = treffer.slice(0, anzahl).map((r, i) => {
      const titel = String(r.title || 'ohne Titel')
        .replace(/\s+/g, ' ')
        .trim();
      const auszug = String(r.content || '')
        .replace(/\s+/g, ' ')
        .trim();
      const kurz =
        auszug.length > AUSZUG_ZEICHEN ? `${auszug.slice(0, AUSZUG_ZEICHEN)}...` : auszug;
      return `${i + 1}. ${titel}\n   ${r.url}\n   ${kurz}`;
    });

    return `Treffer für "${frage}":\n${zeilen.join('\n')}`;
  }
}

class WebLesenTool extends BaseTool {
  get name() {
    return 'web_lesen';
  }

  get description() {
    return 'Holt eine Webseite und gibt ihren lesbaren Text zurück (gekürzt, ohne Navigation)';
  }

  get parameters() {
    return {
      adresse: {
        type: 'string',
        description: 'Vollständige Adresse der Seite, z. B. https://example.org/artikel',
        required: true,
      },
    };
  }

  async execute(params = {}) {
    const roh = String(params.adresse || '').trim();
    if (!roh) {
      return 'Fehler: "adresse" darf nicht leer sein.';
    }

    let ziel = roh;
    let antwort = null;

    // Weiterleitungen selbst verfolgen, damit JEDE Zwischenstation erneut
    // geprüft wird. Mit `maxRedirects` von axios würde nur die erste Adresse
    // geprüft — eine Weiterleitung auf 169.254.169.254 liefe glatt durch.
    for (let sprung = 0; sprung <= MAX_WEITERLEITUNGEN; sprung += 1) {
      const geprueft = await pruefeAdresse(ziel);
      if (!geprueft.ok) {
        return `Fehler: ${geprueft.grund}`;
      }

      const agent = festgenagelterAgent(geprueft.url.protocol, geprueft.ip);
      try {
        antwort = await axios.get(geprueft.url.toString(), {
          timeout: LESEN_TIMEOUT_MS,
          maxRedirects: 0,
          responseType: 'text',
          maxContentLength: MAX_DOWNLOAD_BYTES,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
          validateStatus: s => (s >= 200 && s < 300) || (s >= 300 && s < 400),
          transitional: { silentJSONParsing: false },
          // Verbindet ausschliesslich zur geprueften IP (siehe oben).
          httpAgent: agent,
          httpsAgent: agent,
        });
      } catch (err) {
        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
          return `Fehler: Die Seite antwortete nicht innerhalb von ${Math.round(LESEN_TIMEOUT_MS / 1000)}s.`;
        }
        if (err.response) {
          return `Fehler: Die Seite antwortete mit Status ${err.response.status}.`;
        }
        logger.warn(`web_lesen fehlgeschlagen (${ziel}): ${err.message}`);
        return `Fehler beim Abruf: ${err.message}`;
      }

      if (antwort.status >= 300 && antwort.status < 400) {
        const nach = antwort.headers && antwort.headers.location;
        if (!nach) {
          return `Fehler: Die Seite leitet weiter, nennt aber kein Ziel (Status ${antwort.status}).`;
        }
        ziel = new URL(nach, geprueft.url).toString();
        antwort = null;
        continue;
      }
      break;
    }

    if (!antwort) {
      return `Fehler: Mehr als ${MAX_WEITERLEITUNGEN} Weiterleitungen — abgebrochen.`;
    }

    const typ = String((antwort.headers && antwort.headers['content-type']) || '').toLowerCase();
    if (typ && !/text\/html|text\/plain|application\/xhtml|text\/xml|application\/xml/.test(typ)) {
      return `Fehler: Die Adresse liefert "${typ.split(';')[0]}" — nur Textseiten sind lesbar.`;
    }

    const koerper = typeof antwort.data === 'string' ? antwort.data : String(antwort.data ?? '');
    const { titel, text } = /html|xml/.test(typ || 'text/html')
      ? htmlZuText(koerper)
      : { titel: null, text: koerper.trim() };

    if (!text) {
      return 'Die Seite enthält keinen lesbaren Text (womöglich reines JavaScript).';
    }

    const gekuerzt = text.length > MAX_TEXT_ZEICHEN;
    const inhalt = gekuerzt
      ? `${text.slice(0, MAX_TEXT_ZEICHEN)}\n... [gekuerzt bei ${MAX_TEXT_ZEICHEN} Zeichen]`
      : text;

    return [titel ? `Titel: ${titel}` : null, `Quelle: ${ziel}`, '', inhalt]
      .filter(z => z !== null)
      .join('\n');
  }
}

module.exports = { WebSucheTool, WebLesenTool };
module.exports.istPrivateIp = istPrivateIp;
module.exports.pruefeAdresse = pruefeAdresse;
module.exports.htmlZuText = htmlZuText;
module.exports.MAX_TEXT_ZEICHEN = MAX_TEXT_ZEICHEN;
