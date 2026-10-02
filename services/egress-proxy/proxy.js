/**
 * Der Ausgangs-Proxy der Apps (J38, 02.10.2026).
 *
 * Die Apps haengen im Netz `arasul-apps`, das keinen Weg ins Internet hat. Wer
 * trotzdem hinaus muss, geht durch diesen Prozess, und er laesst genau die
 * Hostnamen durch, die das Manifest der App in `verbindungen` nennt.
 *
 * WARUM EIN EIGENER PROZESS UND KEIN SQUID. Zwei Dinge sind hier die Aufgabe,
 * und beide kann Squid nur mit Zusatz: der Zugang ist je APP und Stand (ein
 * Squid ordnet nach Netzadresse oder Basic-Auth gegen eine Datei, die jemand
 * schreiben und neu laden muss), und jede Entscheidung soll gezaehlt in der
 * Datenbank des Geraets landen. Hier sind es 300 Zeilen ohne Abhaengigkeit,
 * die ein Mensch an einem Nachmittag liest.
 *
 * WAS ER KANN: `CONNECT host:port` (https, ohne TLS aufzubrechen: er sieht den
 * Hostnamen, nie den Inhalt) und Anfragen mit absoluter URL (http). Beides
 * wird am HOSTNAMEN entschieden.
 *
 * WER DER AUFRUFER IST, steht im Zugang: `Proxy-Authorization: Basic
 * <containername>:<token>`, der Token ein HMAC des Namens mit dem Geheimnis des
 * Geraets. Die App erfaehrt ihn aus `HTTPS_PROXY` in ihrer Umgebung, die das
 * Backend beim Anlegen des Containers setzt. Eine App kann sich so nicht als
 * eine andere ausgeben.
 *
 * WAS ER NICHT DURCHLAESST, auch wenn der Name freigegeben ist: Adressen im
 * eigenen Haus (Loopback, privat, link-local). Ein freigegebener Name, der auf
 * 192.168.x.x zeigt, waere sonst der Weg einer App ins LAN.
 */

const http = require('http');
const net = require('net');
const dns = require('dns');
const crypto = require('crypto');

const KONTAKT_FRIST_MS = 10 * 1000;
const LEERLAUF_MS = 5 * 60 * 1000;
// Wie viele verschiedene abgewiesene Hostnamen je App und Stand im Speicher
// bleiben. Eine App, die Zufallsnamen ruft, soll die Tabelle nicht fuellen.
const MAX_ZIELE_JE_APP = 100;

/** Der Token einer Kennung. Muss mit `ausgangsProxy.tokenFuer` im Backend uebereinstimmen. */
function tokenFuer(geheimnis, name) {
  return crypto.createHmac('sha256', geheimnis).update(`egress-proxy:${name}`).digest('hex');
}

function gleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** `arasul-app-<id>-<stand>` -> `{ appId, stand }`, sonst `null`. */
function leseName(name) {
  const m = /^arasul-app-(.+)-(live|test)$/.exec(name);
  return m ? { appId: m[1], stand: m[2] } : null;
}

/** Wer ruft? `{ appId, stand }` oder `null`, wenn der Zugang fehlt oder nicht stimmt. */
function leseZugang(kopf, geheimnis) {
  const m = /^Basic\s+(.+)$/i.exec(kopf || '');
  if (!m) {
    return null;
  }
  const klar = Buffer.from(m[1], 'base64').toString('utf8');
  const i = klar.indexOf(':');
  if (i < 1) {
    return null;
  }
  const name = klar.slice(0, i);
  if (!gleich(klar.slice(i + 1), tokenFuer(geheimnis, name))) {
    return null;
  }
  return leseName(name);
}

/** Ist das eine Adresse, die ins eigene Haus fuehrt? */
function istPrivat(adresse) {
  if (net.isIPv4(adresse)) {
    const [a, b] = adresse.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const klein = adresse.toLowerCase();
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(klein);
  if (v4) {
    return istPrivat(v4[1]);
  }
  return (
    klein === '::' ||
    klein === '::1' ||
    klein.startsWith('fe80:') ||
    klein.startsWith('fc') ||
    klein.startsWith('fd')
  );
}

/** `host:port` oder `[v6]:port` -> `{ host, port }`. */
function leseZiel(text) {
  const m = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(text || '');
  if (!m) {
    return null;
  }
  return { host: (m[1] || m[2]).toLowerCase().replace(/\.$/, ''), port: Number(m[3]) };
}

/**
 * @param {object} o
 * @param {string} o.geheimnis
 * @param {() => Promise<Record<string, string[]>>} o.holeRegeln `{ "<app>:<stand>": [hostnamen] }`
 * @param {(ereignisse: object[]) => Promise<void>} o.sende nimmt gezaehlte Entscheidungen entgegen
 * @param {boolean} [o.privateErlauben] nur fuer Tests
 * @param {(msg: string) => void} [o.log]
 */
function erzeugeProxy({ geheimnis, holeRegeln, sende, privateErlauben = false, log = () => {} }) {
  let regeln = null; // bis zur ersten Antwort: nichts erlaubt
  let regelnSeit = null;
  const zaehler = new Map();

  const zaehle = (appId, stand, host, ergebnis) => {
    let schluessel = [appId, stand, host, ergebnis].join('\t');
    if (!zaehler.has(schluessel) && ergebnis === 'abgewiesen') {
      const belegt = [...zaehler.keys()].filter(k => k.startsWith(`${appId}\t${stand}\t`)).length;
      if (belegt >= MAX_ZIELE_JE_APP) {
        schluessel = [appId, stand, '(weitere)', ergebnis].join('\t');
      }
    }
    const eintrag = zaehler.get(schluessel) || { anzahl: 0, zuletzt: null };
    eintrag.anzahl += 1;
    eintrag.zuletzt = new Date().toISOString();
    zaehler.set(schluessel, eintrag);
  };

  async function ladeRegeln() {
    try {
      regeln = await holeRegeln();
      regelnSeit = Date.now();
    } catch (err) {
      log(`Regeln nicht ladbar, die letzten gelten weiter: ${err.message}`);
    }
  }

  async function sendeZaehler() {
    if (zaehler.size === 0) {
      return;
    }
    const stapel = [...zaehler.entries()];
    zaehler.clear();
    const ereignisse = stapel.map(([k, v]) => {
      const [app_id, stand, host, ergebnis] = k.split('\t');
      return { app_id, stand, host, ergebnis, anzahl: v.anzahl, zuletzt: v.zuletzt };
    });
    try {
      await sende(ereignisse);
    } catch (err) {
      // Zurueck in den Speicher; der naechste Durchgang versucht es wieder.
      for (const [k, v] of stapel) {
        const da = zaehler.get(k);
        zaehler.set(k, {
          anzahl: v.anzahl + (da ? da.anzahl : 0),
          zuletzt: da && da.zuletzt > v.zuletzt ? da.zuletzt : v.zuletzt,
        });
      }
      log(`Zaehler nicht gesendet (${ereignisse.length}), bleiben im Speicher: ${err.message}`);
    }
  }

  /**
   * Entscheidet und zaehlt. Gibt `{ ok: true, adresse }` oder `{ ok: false, status, grund }`.
   */
  async function pruefe(zugang, host) {
    if (!zugang) {
      return { ok: false, status: 407, grund: 'Zugang fehlt oder ist ungueltig' };
    }
    const liste = (regeln && regeln[`${zugang.appId}:${zugang.stand}`]) || [];
    if (!liste.includes(host)) {
      zaehle(zugang.appId, zugang.stand, host, 'abgewiesen');
      return {
        ok: false,
        status: 403,
        grund: `${host} steht nicht in den verbindungen von ${zugang.appId}`,
      };
    }
    let adressen;
    try {
      adressen = await dns.promises.lookup(host, { all: true });
    } catch {
      zaehle(zugang.appId, zugang.stand, host, 'erlaubt');
      return { ok: false, status: 502, grund: `${host} laesst sich nicht aufloesen` };
    }
    const offen = privateErlauben ? adressen : adressen.filter(a => !istPrivat(a.address));
    if (offen.length === 0) {
      zaehle(zugang.appId, zugang.stand, host, 'abgewiesen');
      return { ok: false, status: 403, grund: `${host} zeigt auf eine Adresse im eigenen Haus` };
    }
    zaehle(zugang.appId, zugang.stand, host, 'erlaubt');
    return { ok: true, adresse: offen[0].address };
  }

  const server = http.createServer(async (req, res) => {
    // Ein Aufruf an den Proxy selbst (Pfad statt absoluter URL): der Gesundheitscheck.
    if (req.url.startsWith('/')) {
      if (req.url === '/health') {
        const ok = regeln !== null;
        res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok, regeln_seit: regelnSeit, offen: zaehler.size }));
        return;
      }
      res.writeHead(400).end();
      return;
    }
    let url;
    try {
      url = new URL(req.url);
    } catch {
      res.writeHead(400).end('Ungueltige Adresse');
      return;
    }
    const zugang = leseZugang(req.headers['proxy-authorization'], geheimnis);
    const urteil = await pruefe(zugang, url.hostname.toLowerCase());
    if (!urteil.ok) {
      const kopf = { 'content-type': 'text/plain; charset=utf-8' };
      if (urteil.status === 407) {
        kopf['proxy-authenticate'] = 'Basic realm="arasul"';
      }
      res.writeHead(urteil.status, kopf).end(`${urteil.grund}\n`);
      return;
    }
    const kopf = { ...req.headers };
    delete kopf['proxy-authorization'];
    delete kopf['proxy-connection'];
    const aus = http.request(
      {
        host: urteil.adresse,
        port: url.port || 80,
        method: req.method,
        path: url.pathname + url.search,
        headers: { ...kopf, host: url.host },
        timeout: KONTAKT_FRIST_MS,
      },
      antwort => {
        res.writeHead(antwort.statusCode, antwort.headers);
        antwort.pipe(res);
      }
    );
    aus.on('timeout', () => aus.destroy());
    aus.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502).end('Gegenstelle nicht erreichbar\n');
      } else {
        res.destroy();
      }
    });
    req.pipe(aus);
  });

  server.on('connect', async (req, sock, kopf) => {
    sock.on('error', () => {});
    const ziel = leseZiel(req.url);
    const zugang = leseZugang(req.headers['proxy-authorization'], geheimnis);
    const antwort = (status, text, extra = '') =>
      sock.end(`HTTP/1.1 ${status} ${text}\r\n${extra}Connection: close\r\n\r\n`);
    if (!ziel) {
      antwort(400, 'Bad Request');
      return;
    }
    const urteil = await pruefe(zugang, ziel.host);
    if (!urteil.ok) {
      log(`${urteil.status} ${zugang ? zugang.appId : '?'} -> ${ziel.host}: ${urteil.grund}`);
      antwort(
        urteil.status,
        urteil.status === 407
          ? 'Proxy Authentication Required'
          : urteil.status === 403
            ? 'Forbidden'
            : 'Bad Gateway',
        urteil.status === 407 ? 'Proxy-Authenticate: Basic realm="arasul"\r\n' : ''
      );
      return;
    }
    const aus = net.connect({ host: urteil.adresse, port: ziel.port });
    let verbunden = false;
    aus.setTimeout(KONTAKT_FRIST_MS);
    aus.once('connect', () => {
      verbunden = true;
      aus.setTimeout(LEERLAUF_MS);
      sock.setTimeout(LEERLAUF_MS);
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (kopf && kopf.length) {
        aus.write(kopf);
      }
      aus.pipe(sock);
      sock.pipe(aus);
    });
    aus.on('timeout', () => aus.destroy());
    sock.on('timeout', () => sock.destroy());
    aus.on('error', () => {
      if (verbunden) {
        sock.destroy();
      } else {
        antwort(502, 'Bad Gateway');
      }
    });
    aus.on('close', () => sock.destroy());
    sock.on('close', () => aus.destroy());
  });

  return { server, ladeRegeln, sendeZaehler, zaehler, zaehle };
}

module.exports = { erzeugeProxy, tokenFuer, leseZugang, leseName, istPrivat, leseZiel };
